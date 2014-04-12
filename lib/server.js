/* -*- coding: UTF-8, tab-width: 2 -*- */
/*jslint indent: 2, maxlen: 80, continue: true, unparam: true, node: true */
'use strict';

var CF,  /* constructor function for this file's pseudo-class */
  PT,  /* prototype alias */
  fs = require('fs'),
  pathLib = require('path'),
  express = require('express'),
  routes = require('./routes.js'),
  bodyParser = require('body-parser'),
  winston = require('winston'),
  JSONDB = require('./jsondb.js'),
  ignoreFuncArg = String,
  ld = require('lodash'),
  msec = require('./milliseconds.js'),
  util = require('util'),
  events = require('events');


CF = function FnordCreditServer(opts) {
  /*jslint nomen:true */
  if (CF.super_) { CF.super_.apply(this, arguments); }
  /*jslint nomen:false */
  var self = this;
  if (!opts) { opts = {}; }
  self.port = (opts.port || +process.env.PORT || self.defaultPort);
  self.appBaseDir = pathLib.dirname(pathLib.dirname(require.main.filename));
  self.webPubDir = pathLib.join(self.appBaseDir, 'static');
  if (opts.logFile) {
    self.on('log', winston.log);
    self.addLogFile(opts.logFile);
  }

  self.dbMgr = new JSONDB({
    storageFilePrefix:  pathLib.join(self.appBaseDir, 'db', 'database'),
    backupFilesPrefix:  pathLib.join(self.appBaseDir, 'db', 'backup.'),
    maintncIntv:        msec.fromMinutes(1),
    backupIntv:         msec.fromHours(3),
  });
  self.dbMgr.on('log',    self.log.bind(self));
  self.dbMgr.on('error',  self.logErr.bind(self));
};
util.inherits(CF, events.EventEmitter);
PT = CF.prototype;


PT.toString = function () {
  return '[' + String(this.constructor.name) + ' *:' + String(this.port) + ']';
};


PT.defaultPort = 8000;
PT.dbIndexPrefix = '~';
// ^-- prefix should be /[^a-z_]/ in order to avoid collisions with
//     native object property names


PT.log     = function (msg) { this.emit('log', 'info',  msg); };
PT.logErr  = function (msg) { this.emit('log', 'error', msg); };
PT.logWarn = function (msg) { this.emit('log', 'warn',  msg); };


PT.addLogFile = function (fn) {
  var self = this;
  fn = String(fn);
  if (pathLib.basename(fn) === fn) {
    // ^-- fn contains no path, not even './'
    fn = pathLib.join(self.appBaseDir, 'logs', fn);
  }
  winston.add(winston.transports.File, { filename: fn, json: false });
};


PT.start = function () {
  var self = this, app = self.expressApp;
  if (!app) {
    app = self.expressApp = express();
    app.use('/', express.static(self.webPubDir));
    app.use(bodyParser());
    routes.install(app, self);
  }
  if (!self.webServer) {
    self.webServer = app.listen(self.port, self.log.bind(self,
      'Serving web on *:' + self.port));
  }
};


PT.stop = function (reason) {
  var self = this, srv = self.webServer;
  self.log('shutting down: ' + String(reason || 'for reasons'));
  if (srv) {
    self.log('closing webserver');
    srv.close();
  }
  self.dbMgr.shutdown();
};


PT.mkApiError = function FnordCreditApiError(statusCode, reason) {
  var err = new Error(reason);
  err.statusCode = statusCode;
  return err;
};


PT.dbGetUserByName = function getUser(username, expectExists) {
  var self = this, db = self.dbMgr.data, userRec;
  userRec = db[self.dbIndexPrefix + username];
  if (userRec) { return userRec; }
  userRec = db[username];
  if (userRec) {
    delete db[username];
    db[self.dbIndexPrefix + username] = userRec;
    self.logWarn('DB Upgrade: added prefix for username: ' + username);
    return userRec;
  }
  if (expectExists) {
    throw self.mkApiError(404, // Not Found
      'Username not found');
  }
  return null;
};


PT.dbUpsertUser = function getUser(userRec) {
  var self = this, db = self.dbMgr.data;
  if (!userRec.name) { throw new Error('cannot store userRec w/o .name'); }
  self.dbMgr.gonnaModify();
  db[self.dbIndexPrefix + userRec.name] = userRec;
};


PT.chkDbReady = function () {
  var self = this;
  if (!this.dbMgr.data) {
    return self.mkApiError(503, // Service Unavailable
      'Database not loaded');
  }
  return null;
};


PT.expectApiValueType = function (field, value, expType) {
  var self = this, rcvType = typeof value;
  if (expType !== rcvType) {
    throw self.mkApiError(501, // Not Implemented
      'Unsupported field type {"fieldName":' + JSON.stringify(field) +
      // home-made sorted JSON = better compatibility with sed/awk
      ', "receivedType": "' + rcvType +
      '", "expectedType": "' + expType +
      '"}');
  }
};


PT.chkAcceptableUsername = function (un) {
  var self = this;
  if (!un) {
    return self.mkApiError(406, // Not Acceptable
      // :TODO: "406 Not Acceptable" relates to the client's "Accept:" header,
      //        maybe consider "449 Retry with valid parameters: username"
      'No username set');
  }
  if ('string' !== typeof un) {
    return self.mkApiError(501, // Not Implemented
      'Unsupported username format');
  }
  return null;
};


PT.addUser = function (username, whenAdded) {
  var self = this,
    commonError = self.chkDbReady() || self.chkAcceptableUsername(username);
  if (commonError) { return whenAdded(commonError); }
  try {
    if (self.dbGetUserByName(username)) {
      return whenAdded(self.mkApiError(409, // Conflict
        'User already exists'));
    }
    self.dbUpsertUser({ name: username, credit: 0 });
  } catch (dbError) {
    dbError.statusCode = 500;
    return whenAdded(dbError);
  }
  self.log('[addUser] New user created: ' + JSON.stringify(username));
  whenAdded(null, { created: username });
};


PT.getAllUsernames = function (deliverHere) {
  var self = this, db = self.dbMgr.data,
    commonError = self.chkDbReady();
  if (commonError) { return deliverHere(commonError); }
  try {
    return deliverHere(null, ld.pluck(db, 'name'));
  } catch (pluckErr) {
    deliverHere(pluckErr, null);
  }
};


PT.getUserCredit = function (username, deliverHere) {
  var self = this,
    commonError = self.chkDbReady() || self.chkAcceptableUsername(username);
  if (commonError) { return deliverHere(commonError); }
  try {
    return deliverHere(null, self.dbGetUserByName(username, true).credit);
  } catch (dbErr) {
    deliverHere(dbErr, null);
  }
};


PT.updateUserCredits = function (upd, deliverNewUserRec) {
  var self = this, userRec, oldAmount,
    commonError = self.chkDbReady() || self.chkAcceptableUsername(upd.username);
  if (commonError) { return deliverNewUserRec(commonError); }
  if (!upd) {
    return deliverNewUserRec(self.mkApiError(500, // Internal Server Error
      'no job description'));
  }
  try {
    userRec = self.dbGetUserByName(upd.username, true);
    oldAmount = userRec.amount;
    self.expectApiValueType('db:userRec:oldAmount', oldAmount, 'number');
    switch (upd.method) {
    case 'delta':
      self.expectApiValueType('amount', upd.amount, 'number');
      userRec.credit += upd.amount;
      self.log('[userCredits] Changed credit for user ' +
        JSON.stringify(upd.username) + ' by ' + upd.amount +
          ' from ' + oldAmount + ' to ' + userRec.credit);
      self.dbUpsertUser(userRec);
      return deliverNewUserRec(null, userRec);
    default:
      throw self.mkApiError(501, // Not Implemented
        'Unsupported credits update method');
    }
  } catch (dbErr) {
    deliverNewUserRec(dbErr, null);
  }
};




module.exports = CF;
if (require.main === module) {
  (function () {
    var fcs = new CF({ logFile: 'credit.log' });
    process.once('SIGHUP', fcs.stop.bind(fcs, 'received hangup signal'));
    process.once('SIGINT', fcs.stop.bind(fcs, 'received interrupt signal'));
    fcs.start();
  }());
}
