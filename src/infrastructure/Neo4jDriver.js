const neo4j = require('neo4j-driver');

class Neo4jDriver {
  constructor() {
    // Explicitly disabling encryption for local bolt connection
    this.driver = neo4j.driver(
      process.env.NEO4J_URI,
      neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASSWORD),
      { encrypted: false, trust: 'TRUST_ALL_CERTIFICATES' }
    );
  }

  async run(cypher, params = {}) {
    console.log(`[Neo4j] Executing: ${cypher}`);
    const session = this.driver.session();
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
