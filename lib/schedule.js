/**
 * Created by woods on 9/26/18.
 */

const config = require('config');
const schedule = require('node-schedule');
const Request = require('request-promise');
const uuid = require('uuid/v4');
/**
 *
 * @type {Container}
 */
const persianDate = require('persian-date');

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

function getDate() {
  const datePick = new Date();
  const year = datePick.getFullYear();
  const month = (datePick.getMonth() + 1).toString().padStart(2, '0');
  const day = datePick
    .getDate()
    .toString()
    .padStart(2, '0');
  const hours = datePick
    .getHours()
    .toString()
    .padStart(2, '0');
  const minutes = datePick
    .getMinutes()
    .toString()
    .padStart(2, '0');
  const seconds = datePick
    .getSeconds()
    .toString()
    .padStart(2, '0');
  const milliseconds = datePick
    .getMilliseconds()
    .toString()
    .padEnd(3, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}${milliseconds}`;
}

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
    .then(([person, listWeek, listToday]) => person.map((v) => sendLunchRequest(sqlite, v, listWeek, listToday)))
    .catch((error) => console.error(error));
}

function sendLunchRequest(sqlite, person, listWeek, listToday) {
  const body = {
    channel: `@${person.username}`,
    msg: 'لطفا غذا فردای خود را با کیلک برروی نام غذا انتخاب کنید',
    attachments: [
      {
        title: 'لیست غذاها:',
        actions: [],
      },
    ],
  };

  if (!listToday.length && !listWeek.length) return;

  const oid = uuid();
  const listRow = listToday.length ? listToday[0] : listWeek[0];
  const list = listRow.list.split(/\|/g);
  for (let i = 0; i < list.length; i++)
    body.attachments[0].actions.push({
      type: 'button',
      text: list[i],
      msg: `!lunch_tomorrow pick ${oid} ${listRow.id} ${list[i]}`,
      // eslint-disable-next-line
      msg_in_chat_window: true,
    });

  if (config.get('custom.order.cancel'))
    body.attachments[0].actions.push({
      type: 'button',
      text: 'غذا میل ندارم!',
      msg: `!lunch_tomorrow no ${oid} 0 0`,
      // eslint-disable-next-line
      msg_in_chat_window: true,
    });

  Request({
    method: 'post',
    url: `${config.get('custom.rocket.url')}${config.get('custom.rocket.api')}/chat.postMessage`,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': 'y79MateTAAr3LEz6E',
      'X-Auth-Token': 'iz7eRC-_zr6lGxFryjfRdyb9HBvOt44cSMwaD_5GB7P',
    },
    body,
    json: true,
  })
    .then((data) => {
      // noinspection JSUnresolvedVariable
      sqlite.run(
        `INSERT INTO lunch_order (id, person_id, rocket_message_id, rocket_room_id, insert_date) VALUES (?, ?, ?, ?, ?)`,
        [oid, person.id, data.message._id, data.message.rid, getDate()],
      );

      return data;
    })
    .catch((error) => console.log(error.message.toString()));
}
