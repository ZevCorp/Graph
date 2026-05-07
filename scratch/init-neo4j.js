const neo4j = require('neo4j-driver');
require('dotenv').config();

async function init() {
  const driver = neo4j.driver('bolt://127.0.0.1:7687', neo4j.auth.basic('neo4j', 'neo4j'), { encrypted: false });
  try {
    const session = driver.session({ database: 'system' });
    console.log("Connecting to system database to change password...");
    await session.run("ALTER CURRENT USER SET PASSWORD FROM 'neo4j' TO 'password'");
    console.log("Password changed successfully to 'password'.");
  } catch (err) {
    console.log("Error or already changed:", err.message);
  } finally {
    await driver.close();
  }
}

init();
