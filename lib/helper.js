/**
 * Created by pooya on 9/27/18.
 */

const config = require('config');
const Request = require('request-promise');
const uuid = require('uuid/v4');

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
      msg: `!lunch_tomorrow no ${oid} 0 -`,
      // eslint-disable-next-line
      msg_in_chat_window: true,
    });

  return Request({
    method: 'post',
    url: `${config.get('custom.rocket.url')}${config.get('custom.rocket.api')}/chat.postMessage`,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': 'hXX753szzaEcWzc5k',
      'X-Auth-Token': 'BGT9z3k9wSnAuiHF3ZBnkHF-rXWoxDgL0ldP51N14Id',
    },
    body,
    json: true,
  }).then((data) => {
    // noinspection JSUnresolvedVariable
    sqlite.run(
      `INSERT INTO lunch_order (id, person_id, rocket_message_id, rocket_room_id, insert_date) VALUES (?, ?, ?, ?, ?)`,
      [oid, person.id, data.message._id, data.message.rid, getDate()],
    );

    return data;
  });
}

module.exports = {
  getDate,
  sendLunchRequest,
};
