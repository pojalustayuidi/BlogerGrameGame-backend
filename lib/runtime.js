'use strict';
require('dotenv').config();
const {requireLocalConfiguration} = require('./config');
const config = requireLocalConfiguration(process.env);
module.exports = {config};
