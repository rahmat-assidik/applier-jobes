var mysql = require('mysql2/promise');
var { databaseOptions } = require('./config');

var pool = mysql.createPool(databaseOptions);

module.exports = pool;
