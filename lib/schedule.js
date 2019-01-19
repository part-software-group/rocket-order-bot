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
const db = require('../models/index');

const attempt = Number(config.get('custom.order.attempt'));
let [startHour, startMinute] = config.get('custom.order.start').split(':');
let [endHour, endMinute] = config.get('custom.order.end').split(':');

module.exports = function() {
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
    `Schedule order set to every day ${startHour
      .toString()
      .padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`,
  );
  schedule.scheduleJob(`${startMinute} ${startHour} * * *`, startRequest);

  for (let i = 0; i < timer.length; i++) {
    logger.info(
      `Schedule order set to every day ${timer[i].hour
        .toString()
        .padStart(2, '0')}:${timer[i].minute.toString().padStart(2, '0')}`,
    );
    schedule.scheduleJob(`${timer[i].minute} ${timer[i].hour} * * *`, attemptRequest);
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
  schedule.scheduleJob(
    `${finishDate.minute()} ${finishDate.hour()} * * *`,
    finishRequest,
  );

  logger.info(
    `Schedule update set to every day ${startHour
      .toString()
      .padStart(2, '0')}:${startMinute.toString().padStart(2, '0')}`,
  );
  schedule.scheduleJob(`${startMinute} ${startHour} * * *`, () =>
    helper
      .updateOrderProcessFinish(db, finishDate)
      .then(() => true)
      .catch((error) =>
        logger.error(`Can't upsert order process finish! ${error.message.toString()}`),
      ),
  );
};

function startRequest() {
  const { available, weekDay, date } = helper.nextDateInfo();
  if (!available) return;

  Promise.all([
    db.Person.getAll(),
    db.Daily.getDailyMenuList('1', 0, date, weekDay),
    db.Daily.getDailyMenuList('0', 0, date, weekDay),
  ])
    .then(([person, primaryMenu, secondaryMenu]) =>
      person.map((v) => helper.sendLunchRequest(db, v, primaryMenu, secondaryMenu)),
    )
    .catch((error) =>
      logger.error(`Can't start order request! ${error.message.toString()}`),
    );
}

function attemptRequest() {
  db.PersonOrder.findScheduleOrder()
    .then((data) => {
      const list = data.filter(
        (v) => v.personOrderMenu.length === 0 && !JSON.parse(v.rocketMessageId).result,
      );

      return Promise.map(list, removeOrder);
    })
    .delay(3000)
    .then(() => startRequest())
    .catch((error) =>
      logger.error(`Can't attempt order request! ${error.message.toString()}`),
    );
}

function removeOrder(PersonOrder) {
  const rocketMessageId = JSON.parse(PersonOrder.rocketMessageId);
  if (rocketMessageId.primary)
    helper.deleteLunchRequest(PersonOrder.rocketRoomId, rocketMessageId.primary);
  if (rocketMessageId.secondary)
    helper.deleteLunchRequest(PersonOrder.rocketRoomId, rocketMessageId.secondary);

  return db.PersonOrder.deleteById(PersonOrder.id);
}

function finishRequest() {
  db.PersonOrder.findScheduleOrder()
    .then((data) => {
      data.filter((v) => v.personOrderMenu.length === 0).map((v) => {
        const rocketMessageId = JSON.parse(v.rocketMessageId);
        if (rocketMessageId.primary)
          helper.deleteLunchRequest(v.rocketRoomId, rocketMessageId.primary);
        if (rocketMessageId.secondary)
          helper.deleteLunchRequest(v.rocketRoomId, rocketMessageId.secondary);
      });

      return true;
    })
    .catch((error) =>
      logger.error(`Can't finish order request! ${error.message.toString()}`),
    );
}
