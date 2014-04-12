/* -*- coding: UTF-8, tab-width: 2 -*- */
/*jslint indent: 2, maxlen: 80, continue: true, unparam: true, node: true */
'use strict';

var EX = exports;


EX.install = function (app, fnorDB) {
  var apiFwd;
  apiFwd = function (res, opName) {
    return EX.serveApiResult.bind(null, fnorDB, res, opName);
  };

  app.get('/users/all', function (req, res) {
    fnorDB.getAllUsernames(apiFwd(res, 'listUsernames'));
  });

  app.post('/user/add', function (req, res) {
    fnorDB.addUser(req.body.username, apiFwd(res, 'addUser'));
  });

  app.post('/user/credit', function (req, res) {
    fnorDB.updateUserCredits({
      username: req.body.username,
      method:   'delta',
      amount:   req.body.delta,
    }, apiFwd(res, 'userCredits'));
  });

};


EX.statusPhraseRgx = /^[A-Za-z ]*[A-Za-z]/;
EX.defaultReplyEncoding = 'UTF-8';
EX.defaultReplyMimeType = 'text/plain';


EX.serveApiResult = function (fnorDB, res, opName, err, data) {
  var statusCode = 200, statusPhrase = 'Ok';
  if (err) {
    statusCode = err.statusCode || 500;
    statusPhrase = (String(err).match(EX.statusPhraseRgx) ||
      ['Suspicious Error Message'])[0];
    data = String(err);
  }
  if ('string' !== typeof data) {
    try {
      data = JSON.stringify(data);
    } catch (jsonifyErr) {
      statusCode = 500;
      statusPhrase = 'Internal Server Error';
      data = 'unable to jsonify result data';
    }
  }
  fnorDB.log('[' + opName + '] = ' + statusCode + ' ' + statusPhrase);
  res.writeHead(statusCode, statusPhrase, {
    'Content-Type': EX.defaultReplyMimeType,
  });
  res.end(data, EX.defaultReplyEncoding);
};


