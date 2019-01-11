const bodyParser = require('body-parser');
const config = require('config');
/**
 * @type {{open, migrate, all, run}}
 */
const sqlite = require('sqlite');
const express = require('express');
const Promise = require('bluebird');
/**
 * @type {{format}}
 * @property unix
 */
const persianDate = require('persian-date');
const helper = require('./lib/helper');
const logger = require('./lib/log/winston');
/**
 *
 * @type {*[]}
 */
const command = require('./lib/command');
const execute = require('./lib/execute');

const PORT = config.get('server.http.port');
const SUPPORTS = config.get('custom.rocket.supports');

/**
 * @property use
 * @property get
 * @property post
 */
const app = express();
app.use(bodyParser.json());

app.post('/hook/rocket', async (req, res) => {
  /**
   * @property _id
   * @property channel_id
   * @property message_id
   * @property user_name
   */
  const message = req.body.text;
  if (
    Object.prototype.hasOwnProperty.call(req.body, 'message') &&
    Object.prototype.hasOwnProperty.call(req.body.message, 'file')
  ) {
    if (SUPPORTS.indexOf(req.body.user_name) === -1) return helper.sendRocketFail('no_permission', req.body.user_name);

    const fileId = req.body.message.file._id;
    const fileName = req.body.message.file.name;
    if (fileName.match(/^set_lunch_list_date.*/g))
      execute.downloadExcelLunch(sqlite, req.body.user_name, fileId, fileName);
    if (fileName.match(/^set_person_list.*/g)) execute.downloadExcelUser(sqlite, req.body.user_name, fileId, fileName);

    res.setHeader('Content-Type', 'application/json');
    res.send('{"status": "success"}');
    return;
  }

  let isPrimary;
  let selectDate;
  let selectList;
  const dateRequest = {
    now: new persianDate(),
    week: null,
  };
  dateRequest.now.formatPersian = false;
  dateRequest.week = dateRequest.now.subtract('days', Number(dateRequest.now.format('d')) - 1);
  dateRequest.now.formatPersian = true;
  dateRequest.week.formatPersian = true;

  const regex = command(req.body.user_name);
  const regexKeys = Object.keys(regex);
  /**
   *
   * @property help
   * @property date
   * @property getDailyMenu
   * @property getDailyMenuDate
   * @property setDailyMenuDate
   * @property delDailyMenuDate
   * @property lunchNext
   * @property lunchNextAgain
   * @property lunchNextReset
   * @property getOrderList
   * @property getUser
   * @property setUser
   * @property removeUser
   * @property changeCurrentOrders
   * @type {{}}
   */
  const match = {};
  for (let i = 0; i < regexKeys.length; i++) match[regexKeys[i]] = regex[regexKeys[i]].command.exec(message);

  const args = [sqlite, req.body.user_name];
  switch (true) {
    case Boolean(match.help):
      await helper.sendRocketSuccess('help', req.body.user_name, [regex]);
      break;
    case Boolean(match.date):
      await helper.sendRocketSuccess('date', req.body.user_name, [
        dateRequest.now.format('dddd DD-MM-YYYY'),
        dateRequest.week.format('w'),
        dateRequest.now.format('YYYY'),
      ]);
      break;
    default:
      Object.keys(match)
        .filter((v) => Array.isArray(match[v]))
        .map((v) => execute[v].apply(null, args.concat([v]).concat(match[v].slice(1))));
  }

  res.setHeader('Content-Type', 'application/json');
  res.send('{"status": "success"}');
});

Promise.resolve()
  .then(() => sqlite.open(config.get('database.order.file'), { Promise }))
  // Update db schema to the latest version using SQL-based migrations
  .then(() => sqlite.migrate({ migrationsPath: './storage/database/migrations' }))
  // Launch the Node.js app
  .then(() =>
    app.listen(PORT, () => {
      require('./lib/schedule')(sqlite);
      logger.info(`Example app listening on port ${PORT}!`);
    }),
  )
  // Display error message if something went wrong
  .catch((error) => logger.error(error.message.toString()));
