const neo4j = require('neo4j-driver');

class Neo4jDriver {
  constructor() {
    const uri = process.env.NEO4J_URI;
    if (!uri) {
      throw new Error('NEO4J_URI is required');
    }

    this.uri = uri;
    console.log(`[Neo4j] Configured URI: ${this.safeUriForLogs(this.uri)}`);
    this.database = (process.env.NEO4J_DATABASE || '').trim() || undefined;
    console.log(`[Neo4j] Configured database: ${this.database || 'default'}`);
    this.auth = neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD);
    this.driver = this.createDriver(this.uri);
    this.didDirectFallback = false;
  }

  safeUriForLogs(uri) {
    try {
      const parsed = new URL(uri);
      return `${parsed.protocol}//${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}`;
    } catch (error) {
      return `${uri || ''}`.replace(/\/\/.*@/, '//***@');
    }
  }

  createDriver(uri) {
    return neo4j.driver(uri, this.auth, this.buildDriverConfig(uri));
  }

  buildDriverConfig(uri) {
    const scheme = `${uri || ''}`.split(':')[0].toLowerCase();
    const isSecureScheme = scheme.endsWith('+s') || scheme.endsWith('+ssc');
    const isLocalDirectBolt = scheme === 'bolt' || scheme === 'bolt+ssc';

    if (isSecureScheme) {
      return {};
    }

    if (isLocalDirectBolt) {
      return { encrypted: false };
    }

    return {};
  }

  directUriFromRoutingUri(uri) {
    if (uri.startsWith('neo4j+s://')) {
      return uri.replace(/^neo4j\+s:\/\//, 'bolt+s://');
    }

    if (uri.startsWith('neo4j+ssc://')) {
      return uri.replace(/^neo4j\+ssc:\/\//, 'bolt+ssc://');
    }

    if (uri.startsWith('neo4j://')) {
      return uri.replace(/^neo4j:\/\//, 'bolt://');
    }

    return null;
  }

  isDiscoveryError(error) {
    const message = `${error?.message || ''}`;
    return message.includes('Could not perform discovery')
      || message.includes('No routing servers available')
      || message.includes('Unable to retrieve routing information')
      || message.includes('Failed to update routing table');
  }

  async switchToDirectFallback(error) {
    if (this.didDirectFallback || !this.isDiscoveryError(error)) {
      return false;
    }

    const directUri = this.directUriFromRoutingUri(this.uri);
    if (!directUri) {
      return false;
    }

    console.warn(`[Neo4j] Routing discovery failed; retrying with direct URI ${directUri}`);
    await this.driver.close().catch(() => {});
    this.uri = directUri;
    this.driver = this.createDriver(this.uri);
    this.didDirectFallback = true;
    return true;
  }

  async run(cypher, params = {}) {
    console.log(`[Neo4j] Executing: ${cypher}`);
    return this.runWithDriver(cypher, params, true);
  }

  async runWithDriver(cypher, params = {}, allowDirectFallback = true) {
    const session = this.driver.session(this.database ? { database: this.database } : undefined);
    try {
      const result = await session.run(cypher, params);
      console.log(`[Neo4j] Success: ${result.records.length} records`);
      return result.records.map(r => r.toObject());
    } catch (error) {
      console.error(`[Neo4j] ERROR: ${error.message}`);
      if (allowDirectFallback && await this.switchToDirectFallback(error)) {
        return this.runWithDriver(cypher, params, false);
      }
      throw error;
    } finally {
      await session.close();
    }
  }

  async close() {
    await this.driver.close();
  }
}

module.exports = Neo4jDriver;
