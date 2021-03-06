// https://tools.ietf.org/html/rfc3977#section-7.4
//
// This command was supported by Opera M20 client, which is dead now.
//
'use strict';


const from2      = require('from2');
const pump       = require('pump');
const through2   = require('through2');
const status     = require('../status');
const wildmat_re = require('../wildmat');


const CMD_RE = /^NEWNEWS ([^\s]+)\s(\d{6,8})\s(\d{6})(?:\sGMT)?$/i;


module.exports = {
  head:     'NEWNEWS',
  validate: CMD_RE,
  pipeline: true,

  async run(session, cmd) {
    let [ , wildmat_str, d, t ] = cmd.match(CMD_RE);

    let wildmat = null;

    try {
      wildmat = wildmat_re(wildmat_str);
    } catch (err) {
      return `501 ${err.message}`;
    }

    // Backward compatibility, as per RFC 3977 section 7.3.2:
    // 76 => 1976, 12 => 2012
    if (d.length === 6) {
      let current_year = new Date().getUTCFullYear();
      let century = Math.floor(current_year / 100);

      if (Number(d.slice(0, 2)) > current_year % 100) {
        d = String(century - 1) + d;
      } else {
        d = String(century) + d;
      }
    }

    let [ , year, month, day ] = d.match(/^(....)(..)(..)$/);
    let [ , hour, min, sec ]   = t.match(/^(..)(..)(..)$/);

    let ts = new Date(Date.UTC(year, month, day, hour, min, sec));

    let newnews = await session.server._getNewNews(session, ts, wildmat);

    if (Array.isArray(newnews)) newnews = from2.obj(newnews);

    let stream = through2.obj(function (article, encoding, callback) {
      this.push(session.server._buildHeaderField(session, article, 'message-id'));
      callback();
    });

    pump(newnews, stream);

    return [
      status._230_NEWNEWS_FOLLOW,
      stream,
      '.'
    ];
  },

  capability(session, report) {
    report.push('NEWNEWS');
  }
};
