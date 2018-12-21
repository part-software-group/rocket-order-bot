/**
 * Created by woods on 9/26/18.
 */

const config = require('config');
const Promise = require('bluebird');
const schedule = require('node-schedule');

/**
 * @property add
 * @property diff
 * @property subtract
 * @property hour
 */
const persianDate = require('persian-date');

const helper = require('./helper');
const logger = require('./log/winston');

const attempt = Number(config.get('custom.order.attempt'));
let [startHour, startMinute] = config.get('custom.order.start').split(':');
let [endHour, endMinute] = config.get('custom.order.end').split(':');

module.exports = function(sqlite) {
  startHour = Number(startHour);
  startMinute = Number(startMinute);
  endHour = Number(endHour);
  endMinute = Number(endMinute);

  const start = new persianDate().hour(Number(startHour)).minute(Number(startMinute));
  const end = new persianDate().hour(Number(endHour)).minute(Number(endMinute));
  const diff = Math.round(start.diff(end, 'minute') / attempt);

  const timer = [];
  for (let i = 0; i < attempt; i++) {
    let date = new persianDate()
      .hour(Number(startHour))
      .minute(Number(startMinute))
      .add('minute', diff * (i + 1));
    if (end - date < 0) date = date.subtract('second', ((end - date) * -1) / 1000 + 360);
    timer.push({ hour: date.hour(), minute: date.minute() });
  }

  logger.info(
    `Schedule order set to every day ${startHour.toString().padStart(2, '0')}:${startMinute
      .toString()
      .padStart(2, '0')}`,
  );
  schedule.scheduleJob(`${startMinute} ${startHour} * * *`, startRequest.bind(null, sqlite));

  for (let i = 0; i < timer.length; i++) {
    logger.info(
      `Schedule order set to every day ${timer[i].hour.toString().padStart(2, '0')}:${timer[i].minute
        .toString()
        .padStart(2, '0')}`,
    );
    schedule.scheduleJob(`${timer[i].minute} ${timer[i].hour} * * *`, attemptRequest.bind(null, sqlite));
  }

  const finishDate = new persianDate()
    .hour(Number(startHour))
    .minute(Number(startMinute))
    .add('minute', diff * attempt)
    .add('minute', 3);
  logger.info(
    `Schedule order set to every day ${finishDate
      .hour()
      .toString()
      .padStart(2, '0')}:${finishDate
      .minute()
      .toString()
      .padStart(2, '0')}`,
  );
  schedule.scheduleJob(`${finishDate.minute()} ${finishDate.hour()} * * *`, finishRequest.bind(null, sqlite));

  logger.info(
    `Schedule update set to every day ${startHour.toString().padStart(2, '0')}:${startMinute
      .toString()
      .padStart(2, '0')}`,
  );
  schedule.scheduleJob(`${startMinute} ${startHour} * * *`, () =>
    helper
      .updateOrderProcessFinish(sqlite, finishDate)
      .then(() => true)
      .catch((error) => logger.error(`Can't upsert order process finish! ${error.message.toString()}`)),
  );
};

function startRequest(sqlite) {
  const { available, weekDay, date } = helper.nextDateInfo();
  if (!available) return;

  Promise.all([
    sqlite.all(`SELECT id, username FROM person WHERE delete_date = 0`),
    sqlite.all(`SELECT id, list FROM lunch_list WHERE order_date = ? AND delete_date = 0`, [weekDay]),
    sqlite.all(`SELECT id, list FROM lunch_list WHERE order_date = ? AND delete_date = 0`, [date]),
  ])
    .then(([person, listWeek, listToday]) => person.map((v) => helper.sendLunchRequest(sqlite, v, listWeek, listToday)))
    .catch((error) => logger.error(`Can't start lunch request! ${error.message.toString()}`));
}

function attemptRequest(sqlite) {
  const insertDate = Number(helper.getDate().substr(0, 8));

  sqlite
    .all(
      `SELECT o.id as oid, o.person_id, p.username, o.lunch_list_id, o.rocket_room_id, o.rocket_message_id, l.list FROM lunch_order o, person p, lunch_list l WHERE o.person_id = p.id AND o.lunch_list_id = l.id AND o.insert_date / 1000000000 = ? AND o.lunch ISNULL AND o.delete_date = 0`,
      [insertDate],
    )
    .then((data) => data.map((v) => sendAttemptRequest(sqlite, v)))
    .catch((error) => logger.error(`Can't attempt lunch request! ${error.message.toString()}`));
}

function finishRequest(sqlite) {
  const insertDate = Number(helper.getDate().substr(0, 8));

  sqlite
    .all(
      `SELECT rocket_room_id, rocket_message_id FROM lunch_order WHERE insert_date / 1000000000 = ? AND lunch ISNULL AND delete_date = 0`,
      [insertDate],
    )
    .then((data) => data.map((v) => helper.deleteLunchRequest(v.rocket_room_id, v.rocket_message_id)))
    .catch((error) => logger.error(`Can't finish lunch request! ${error.message.toString()}`));
}

/**
 *
 * @param sqlite
 * @param {Object} data
 * @param data.oid
 * @param data.person_id
 * @param data.username
 * @param data.lunch_list_id
 * @param data.rocket_room_id
 * @param data.rocket_message_id
 * @param data.list
 */
function sendAttemptRequest(sqlite, data) {
  const person = { id: data.person_id, username: data.username };
  const list = [{ id: data.lunch_list_id, list: data.list }];

  helper.deleteLunchRequest(data.rocket_room_id, data.rocket_message_id);

  Promise.delay(3000)
    .then(() => sqlite.run(`DELETE FROM lunch_order WHERE id = ?`, [data.oid]))
    .then(() => helper.sendLunchRequest(sqlite, person, list, []))
    .catch((error) => logger.error(`Can't send attempt lunch request! ${error.message.toString()}`));
}
