/* -*- coding: UTF-8, tab-width: 2 -*- */
/*jslint indent: 2, maxlen: 80, continue: true, unparam: true, node: true */
'use strict';

var msec = exports;

msec.learnUnit = function (unitName, factor, base) {
  var perUnit, ucPlural;
  perUnit = msec['per' + unitName] = base * factor;
  ucPlural = unitName.substr(0, 1).toUpperCase() +
    unitName.substr(1, unitName.length) + 's';
  msec['from' + ucPlural] = function (units) { return units * perUnit; };
  msec['to'   + ucPlural] = function (msec) { return (msec / perUnit); };
};

msec.learnUnit('Second', 1000, 1);
msec.learnUnit('Minute', 60, msec.perSeconds);
msec.learnUnit('Hour', 60, msec.perMinute);
msec.learnUnit('Day', 24, msec.perHour);
