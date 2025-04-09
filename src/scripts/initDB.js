const fs = require('fs');
const path = require('path');
const pool = require('../../config/db');

const sql = fs.readFileSync(path.join('db/init.sql')).toString();

pool.query(sql)
  .then(() => {
    console.log('✅ Database initialized');
    process.exit();
  })
  .catch((err) => {
    console.error('❌ Error initializing DB:', err);
    process.exit(1);
  });
