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
   * @property removeLunchListDate
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
    case Boolean(match.getDailyMenu):
      if (SUPPORTS.indexOf(req.body.user_name) === -1)
        return helper.sendRocketFail('no_permission', req.body.user_name);

      isPrimary = match.getDailyMenuDate[1] !== 's';
      execute.getDailyMenu(sqlite, isPrimary, req.body.user_name);
      break;
    case Boolean(match.getDailyMenuDate):
      if (SUPPORTS.indexOf(req.body.user_name) === -1)
        return helper.sendRocketFail('no_permission', req.body.user_name);

      isPrimary = match.getDailyMenuDate[1] !== 's';
      selectDate = match.getDailyMenuDate[2].replace(/[^0-9]+/g, '');

      if (selectDate < 100) execute.getDailyMenuDate(sqlite, isPrimary, selectDate, req.body.user_name);
      else
        execute.getDailyMenuDate(
          sqlite,
          isPrimary,
          helper.convertDateToPersian(selectDate).format('YYYYMMDD'),
          req.body.user_name,
        );
      break;
    case Boolean(match.setDailyMenuDate):
      if (SUPPORTS.indexOf(req.body.user_name) === -1)
        return helper.sendRocketFail('no_permission', req.body.user_name);

      isPrimary = match.setDailyMenuDate[1] !== 's';
      selectDate = match.setDailyMenuDate[2].replace(/[^0-9]+/g, '');
      selectList = match.setDailyMenuDate[3]
        .split(/\s(?=(?:[^"']|"[^"]*")*$)/g)
        .map((v) => (v.substr(0, 1) === '"' ? v.substr(1).slice(0, -1) : v));

      if (match.setDailyMenuDate[2].replace(/\s+/g, '') === 'all')
        execute.setDailyMenuDate(sqlite, isPrimary, 0, selectList, req.body.user_name);
      else if (selectDate > 9 && selectDate < 100)
        execute.setDailyMenuDate(sqlite, isPrimary, selectDate, selectList, req.body.user_name);
      else
        execute.setDailyMenuDate(
          sqlite,
          isPrimary,
          helper.convertDateToPersian(selectDate).format('YYYYMMDD'),
          selectList,
          req.body.user_name,
        );
      break;
    case Boolean(match.removeLunchListDate):
      if (SUPPORTS.indexOf(req.body.user_name) === -1)
        return helper.sendRocketFail('no_permission', req.body.user_name);

      selectDate = match.removeLunchListDate[1].replace(/[^0-9]+/g, '');

      if (selectDate < 100) execute.deleteLunchListDate(sqlite, selectDate, req.body.user_name);
      else
        execute.deleteLunchListDate(
          sqlite,
          helper.convertDateToPersian(selectDate).format('YYYYMMDD'),
          req.body.user_name,
        );
      break;
    case Boolean(match.lunchNext):
      execute.updateLunchNext(
        sqlite,
        match.lunchNext[1],
        match.lunchNext[2],
        match.lunchNext[3],
        req.body.user_name,
        req.body.channel_id,
        req.body.message_id,
      );
      break;
    case Boolean(match.lunchNextAgain): {
      if (SUPPORTS.indexOf(req.body.user_name) === -1)
        return helper.sendRocketFail('no_permission', req.body.user_name);

      const count = Number(match.lunchNextAgain[1] || 1);
      helper.checkOrderProcessFinish(
        sqlite,
        req.body.user_name,
        execute.againLunchNext.bind(null, sqlite, req.body.user_name, count),
        'lunch_next_again',
      );
      break;
    }
    case Boolean(match.lunchNextReset):
      if (SUPPORTS.indexOf(req.body.user_name) === -1)
        return helper.sendRocketFail('no_permission', req.body.user_name);

      execute.resetLunchNext(sqlite, match.lunchNextReset[1], req.body.user_name);
      break;
    case Boolean(match.getOrderList):
      if (SUPPORTS.indexOf(req.body.user_name) === -1)
        return helper.sendRocketFail('no_permission', req.body.user_name);

      helper.checkOrderProcessFinish(
        sqlite,
        req.body.user_name,
        execute.getOrderList.bind(null, sqlite, req.body.channel_id, req.body.user_name),
        'get_order_list',
      );
      break;
    case Boolean(match.getUser):
      if (SUPPORTS.indexOf(req.body.user_name) === -1)
        return helper.sendRocketFail('no_permission', req.body.user_name);

      execute.getUser(sqlite, req.body.user_name);
      break;
    case Boolean(match.setUser):
      if (SUPPORTS.indexOf(req.body.user_name) === -1)
        return helper.sendRocketFail('no_permission', req.body.user_name);

      execute.setUser(sqlite, { name: match.setUser[1], username: match.setUser[2] }, req.body.user_name);
      break;
    case Boolean(match.removeUser):
      if (SUPPORTS.indexOf(req.body.user_name) === -1)
        return helper.sendRocketFail('no_permission', req.body.user_name);

      execute.removeUser(sqlite, match.removeUser[1], req.body.user_name);
      break;
    case Boolean(match.changeCurrentOrders): {
      if (SUPPORTS.indexOf(req.body.user_name) === -1)
        return helper.sendRocketFail('no_permission', req.body.user_name);

      const hour = Number(match.changeCurrentOrders[1]);
      const minute = Number(match.changeCurrentOrders[2]);
      const lunchList = match.changeCurrentOrders[3]
        .split(/\s(?=(?:[^"']|"[^"]*")*$)/g)
        .map((v) => (v.substr(0, 1) === '"' ? v.substr(1).slice(0, -1) : v))
        .join('|');

      execute.changeCurrentOrders(sqlite, hour, minute, lunchList, req.body.user_name);
      break;
    }
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
