import Database from 'better-sqlite3';
const db = new Database(':memory:');
db.exec('CREATE TABLE t (id INTEGER)');
db.prepare('INSERT INTO t VALUES (?)').run(42);
console.log('SQLite OK:', db.prepare('SELECT id FROM t').all());
