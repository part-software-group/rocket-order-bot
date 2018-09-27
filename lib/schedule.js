/**
 * Created by woods on 9/26/18.
 */

const config = require('config');
const schedule = require('node-schedule');

/**
 *
 * @type {Container}
 */
const persianDate = require('persian-date');

const helper = require('./helper');

const attempt = Number(config.get('custom.order.attempt'));
let [startHour, startMinute] = config.get('custom.order.start').split(':');
let [endHour, endMinute] = config.get('custom.order.end').split(':');

module.exports = function(sqlite) {
  startHour = Number(startHour);
  startMinute = Number(startMinute);
  endHour = Number(endHour);
  endMinute = Number(endMinute);

  const start = new persianDate([null, null, null, Number(startHour), Number(startMinute)]);
  const end = new persianDate([null, null, null, Number(endHour), Number(endMinute)]);
  const diff = Math.round(start.diff(end, 'minute') / attempt);

  const timer = [];
  for (let i = 0; i < attempt; i++) {
    let date = new persianDate([null, null, null, Number(startHour), Number(startMinute)]).add(
      'minute',
      diff * (i + 1),
    );
    if (end - date < 0) date = date.subtract('second', ((end - date) * -1) / 1000 + 360);
    timer.push({ hour: date.hour(), minute: date.minute() });
  }

  // firstRequest(sqlite);

  // schedule.scheduleJob(`${Number(startMinute)} ${Number(startHour)} * * *`, firstRequest.bind(null, sqlite));

  // for (let i = 0; i < timer.length; i++)
  //   schedule.scheduleJob(`${timer[i].minute} ${timer[i].hour} * * *`, function() {
  //     console.log('The answer to life, the universe, and everything!');
  //   });
};

function firstRequest(sqlite) {
  const date = new persianDate();
  date.formatPersian = false;

  const week = date.format('w') % 2 === 0 ? 2 : 1;
  Promise.all([
    sqlite.all(`SELECT id, username FROM person WHERE delete_date = 0`),
    sqlite.all(`SELECT id, list FROM lunch_list WHERE order_date = ? AND delete_date = 0`, [
      `${week}${date.day() - 1}`,
    ]),
    sqlite.all(`SELECT id, list FROM lunch_list WHERE order_date = ? AND delete_date = 0`, [date.format('YYYYMMDD')]),
  ])
    .then(([person, listWeek, listToday]) => person.map((v) => helper.sendLunchRequest(sqlite, v, listWeek, listToday)))
    .catch((error) => console.log(error.message.toString()));
}
