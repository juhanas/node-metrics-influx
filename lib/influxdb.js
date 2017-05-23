/*
 * influx.js: InfluxDB interface
 *
 * (C) 2017 Juhana S.
 * (C) 2015 Brandon Hamilton
 * MIT LICENCE
 *
 */

'use strict';

const Influxdb = require('influx');

var influx = null;

function escapeMetadata(str) {
  return str.replace(/ /g, '\\ ').replace(/,/g, '\\,');
}

function escapeString(str) {
  return str.replace(/"/g, '\\\"');
}

function keySort(a, b) {
  return (a < b) ? -1 : (a > b ? 1: 0);
}

var Influx = function(options) {
  influx = new Influxdb.InfluxDB({
    host: options.host,
    port: options.port,
    database: options.database,
    username: options.username,
    password: options.password
  })
  this.precision = options.precision || 'n';
  if (['n','u','ms','s','m','h'].indexOf(this.precision) < 0) {
    throw new Error('Precision must be one of [n,u,ms,s,m,h]');
  }
  this.precisionMultiplier = {
    'n' : 1,
    'u' : 1000,
    'ms': 1000000,
    's' : 1000000000,
    'm' : 60000000000,
    'h' : 3600000000000
  }[this.precision];
  this.batchSize = options.batchSize || 100;
  this.points = [];
}

Influx.prototype.addPoint = function(key, tags, timestamp, fields) {
  this.points.push({
    measurement: key,
    tags,
    fields,
    timestamp: timestamp
  });
}

Influx.prototype.write = function() {
  var points = this.points;
  this.points = [];
  influx.writePoints(points)
  .catch(err => {
      console.error(`Error saving data to InfluxDB! ${err}`)
      this.points.push.apply(this.points, points);
  })
}

module.exports = Influx;
