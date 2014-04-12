/* -*- coding: UTF-8, tab-width: 2 -*- */
/*jslint indent: 2, maxlen: 80, continue: true, unparam: true, node: true */
'use strict';

var CF,  /* constructor function for this file's pseudo-class */
  PT,  /* prototype alias */
  pathLib = require('path'),
  fs = require('fs'),
  msec = require('./milliseconds.js'),
  events = require('events'),
  util = require('util');


CF = function JsonDB(opts) {
  /*jslint nomen:true */
  if (CF.super_) { CF.super_.apply(this, arguments); }
  /*jslint nomen:false */
  var self = this;
  if (!opts) { opts = {}; }
  self.maintncIntv = (opts.maintncIntv || false);
  self.backupIntv  = (opts.backupIntv || false);
  self.storageFilePrefix = opts.storageFilePrefix;
  self.backupFilesPrefix = (opts.backupFilesPrefix ||
    self.storageFilePrefix + '@');
  self.data = null;
  self.modified = false;
  self.timers = {};
  if (self.storageFilePrefix) { self.maintncTask(); }
};
util.inherits(CF, events.EventEmitter);
PT = CF.prototype;


PT.toString = function () {
  return '[' + String(this.constructor.name) +
    ' ' + String(this.filename) + ']';
};


PT.fileEncoding = 'utf8';
PT.fileNamesSuffix = '.json';


PT.loadFromFile = function (srcFn, whenLoaded) {
  var self = this;
  fs.readFile(srcFn, self.fileEncoding, function hazFile(fileErr, content) {
    if (fileErr) {
      if (!fileErr.message) { fileErr = new Error(String(fileErr)); }
      fileErr.message = 'failed to read file: ' + fileErr.message;
      return whenLoaded(fileErr);
    }
    self.loadFromString(content, whenLoaded);
  });
};


PT.loadFromString = function (newDataJSON, whenLoaded) {
  var self = this;
  if (self.data) {
    return whenLoaded(new Error('ignored: previous data is still loaded.'));
  }
  try {
    newDataJSON = JSON.parse(String(newDataJSON));
  } catch (dbParseErr) {
    dbParseErr.message = 'failed to parse JSON: ' + dbParseErr.message;
    return whenLoaded(dbParseErr);
  }
  self.data = newDataJSON;
  self.modified = false;
  whenLoaded(null);
};


PT.gonnaModify = function () {
  this.modified = true;
};


PT.saveIfModified = function (destFn, whenSaved) {
  if (!this.modified) { return whenSaved(null, 'skip: not modified'); }
  this.saveToFile(destFn, whenSaved);
};


PT.saveToFile = function (destFn, whenSaved) {
  var self = this, dbJSON;
  try {
    dbJSON = JSON.stringify(self.data);
  } catch (jsonifyErr) {
    jsonifyErr.message = 'failed to jsonify: ' + jsonifyErr.message;
    return whenSaved(jsonifyErr);
  }
  fs.writeFile(destFn, dbJSON, self.fileEncoding, whenSaved);
};


PT.maintncTask = function () {
  var self = this, dbFn = self.storageFilePrefix + self.fileNamesSuffix;
  self.maintncReschedule(true);
  if (!self.data) {
    self.emit('log', 'Load DB: read ' + dbFn);
    return self.loadFromFile(dbFn, function hasLoaded(err) {
      if (!err) { setImmediate(self.backupNow.bind(self)); }
      self.maintncReport('Load DB', true, err);
    });
  }
  self.emit('log', 'Save DB: if modified, write to ' + dbFn);
  self.saveIfModified(dbFn, self.maintncReport.bind(self, 'Save DB', true));
};


PT.maintncReport = function (opName, reschedule, err, msg) {
  var self = this;
  if (err) {
    self.emit('error', opName + ': ' + String(err));
  } else {
    if ('string' !== typeof msg) { msg = 'success'; }
    self.emit('log', opName + ': ' + msg);
  }
  if (reschedule) { self.maintncReschedule(); }
};


PT.maintncReschedule = function (cancel) {
  var self = this, tmr = self.timers;
  if (tmr.maintnc) { clearTimeout(tmr.maintnc); }
  if (cancel) { return; }
  if (!self.maintncIntv) { return; }
  self.emit('log', 'DB Maintnc: schedule next run in about ' +
    msec.toMinutes(self.maintncIntv).toFixed(2) + ' minutes');
  tmr.maintnc = setTimeout(self.maintncTask.bind(self), self.maintncIntv);
};


PT.backupNow = function () {
  var self = this, tmr = self.timers, destFn;
  if (tmr.backups) { clearTimeout(tmr.backups); }
  destFn = self.backupFilesPrefix + (new Date()).toISOString().replace(/:/g,
    '-') + self.fileNamesSuffix;
  self.saveIfModified(destFn, self.maintncReport.bind(self,
    'Backup DB', false));
  if (self.backupIntv) {
    self.emit('log', 'Backup DB: schedule next run in about ' +
      msec.toHours(self.backupIntv).toFixed(2) + ' hours');
    tmr.backups = setTimeout(self.backupNow.bind(self), self.backupIntv);
  }
};

PT.shutdown = function () {
  var self = this, tmr = self.timers, timerNames = Object.keys(tmr);
  self.emit('log', 'Shutdown DB: cancel ' + timerNames.length + ' timers');
  timerNames.forEach(function (timerName) {
    clearTimeout(tmr[timerName]);
    self.emit('log', 'Shutdown DB: canceled timer ' + timerName);
  });
};



















module.exports = CF;
