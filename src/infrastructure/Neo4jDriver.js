const neo4j = require('neo4j-driver');

class Neo4jDriver {
  constructor() {
    const uri = process.env.NEO4J_URI;
    if (!uri) {
      throw new Error('NEO4J_URI is required');
    }

    const config = this.buildDriverConfig(uri);
    this.database = (process.env.NEO4J_DATABASE || '').trim() || undefined;
    this.driver = neo4j.driver(
      uri,
      neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD),
      config
    );
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

  async run(cypher, params = {}) {
    console.log(`[Neo4j] Executing: ${cypher}`);
    const session = this.driver.session(this.database ? { database: this.database } : undefined);
    try {
      const result = await session.run(cypher, params);
      console.log(`[Neo4j] Success: ${result.records.length} records`);
      return result.records.map(r => r.toObject());
    } catch (error) {
      console.error(`[Neo4j] ERROR: ${error.message}`);
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
