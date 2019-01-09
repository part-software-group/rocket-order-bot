/**
 * Created by woods on 11/2/18.
 */

const Promise = require('bluebird');
/**
 * @property unlinkAsync
 */
const fs = Promise.promisifyAll(require('fs'));
const config = require('config');
const helper = require('./helper');
const logger = require('./log/winston');
/**
 * @type {{format}}
 */
const persianDate = require('persian-date');

const Excel = require('xlsx');
const Populate = require('xlsx-populate');

function downloadExcelLunch(sqlite, username, fileId, fileName) {
  const file = `./storage/temp/${fileId}_${fileName}`;
  const req = helper.downloadExcel(fileId, fileName);

  req
    .on('error', (error) =>
      helper.sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'download_set_lunch_list_date',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    )
    // eslint-disable-next-line
    .pipe(fs.createWriteStream(file))
    .on('close', () => {
      // eslint-disable-next-line
      const wb = Excel.readFile(file);
      const result = Excel.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      const data = {
        text: [],
        param: [],
      };

      for (let i = 1; i < result.length; i++) {
        if (result[i].length < 2) continue;

        data.text.push(`(null, ?, ?, ?)`);
        const [dateList, ...selectList] = result[i];
        const selectDate = helper.convertNumbersToEnglish(dateList.toString()).replace(/[^0-9]+/g, '');

        data.param.push(selectDate < 100 ? selectDate : helper.convertDateToPersian(selectDate).format('YYYYMMDD'));
        data.param.push(selectList.join('|'));
        data.param.push(helper.getDate());
      }

      if (!data.text.length)
        return Promise.all([helper.sendRocketWarning('excel_set_lunch_list_date', username), fs.unlinkAsync(file)]);

      sqlite
        .run('BEGIN')
        .then(() => sqlite.run(`UPDATE lunch_list SET delete_date = ? WHERE delete_date = 0`, [helper.getDate()]))
        .then(() =>
          sqlite.run(
            `INSERT INTO lunch_list (id, order_date, list, insert_date) VALUES ${data.text.join(', ')}`,
            data.param,
          ),
        )
        .then(() => sqlite.run('COMMIT'))
        .then(() => fs.unlinkAsync(file))
        .then(() => helper.sendRocketSuccess('set_lunch_list_date', username))
        .catch((error) => {
          sqlite.run('ROLLBACK');

          // eslint-disable-next-line
          fs.unlinkSync(file);

          throw error;
        })
        .catch((error) =>
          helper.sendRocketFail('error', username, [
            {
              key: 'code',
              value: 'excel_set_lunch_list_date',
            },
            {
              key: 'database',
              value: error.message.toString(),
            },
          ]),
        );
    });
}

function downloadExcelUser(sqlite, username, fileId, fileName) {
  const file = `./storage/temp/${fileId}_${fileName}`;
  const req = helper.downloadExcel(fileId, fileName);

  req
    .on('error', (error) =>
      helper.sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'download_set_person_list',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    )
    // eslint-disable-next-line
    .pipe(fs.createWriteStream(file))
    .on('close', () => {
      // eslint-disable-next-line
      const wb = Excel.readFile(file);
      const result = Excel.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
      const data = {
        text: [],
        param: [],
      };

      for (let i = 1; i < result.length; i++) {
        if (!result[i].length) continue;

        data.text.push(`(null, ?, ?, ?)`);
        data.param.push(result[i][0].toString());
        data.param.push((result[i][1] || '').toString());
        data.param.push(helper.getDate());
      }

      if (!data.text.length)
        return Promise.all([helper.sendRocketWarning('excel_set_person_list', username), fs.unlinkAsync(file)]);

      sqlite
        .run('BEGIN')
        .then(() => sqlite.run(`UPDATE person SET delete_date = ? WHERE delete_date = 0`, [helper.getDate()]))
        .then(() =>
          sqlite.run(`INSERT INTO person (id, username, name, insert_date) VALUES ${data.text.join(', ')}`, data.param),
        )
        .then(() => sqlite.run('COMMIT'))
        .then(() => fs.unlinkAsync(file))
        .then(() => helper.sendRocketSuccess('set_person_list', username))
        .catch((error) => {
          sqlite.run('ROLLBACK');

          // eslint-disable-next-line
          fs.unlinkSync(file);

          throw error;
        })
        .catch((error) =>
          helper.sendRocketFail('error', username, [
            {
              key: 'code',
              value: 'excel_set_person_list',
            },
            {
              key: 'database',
              value: error.message.toString(),
            },
          ]),
        );
    });
}

function getDailyMenu(sqlite, isPrimary, username) {
  sqlite
    .all(
      `SELECT d.order_date order_date, group_concat(m.name, '|') list FROM daily d, daily_menu dm, menu m WHERE d.id = dm.daily_id AND dm.menu_id = m.id AND is_primary = ? AND d.delete_date = 0 AND dm.delete_date = 0 AND m.delete_date = 0 GROUP BY d.id`,
      [isPrimary ? '1' : '0'],
    )
    .then((data) => helper.sendRocketSuccess('get_lunch_list', username, [data]))
    .catch((error) =>
      helper.sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'getDailyMenu',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    );
}

function getDailyMenuDate(sqlite, isPrimary, selectDate, username) {
  sqlite
    .all(
      `SELECT d.order_date order_date, group_concat(m.name, '|') list FROM daily d, daily_menu dm, menu m WHERE d.id = dm.daily_id AND dm.menu_id = m.id AND is_primary = ? AND d.order_date = ? AND d.delete_date = 0 AND dm.delete_date = 0 AND m.delete_date = 0 GROUP BY d.id`,
      [isPrimary ? '1' : '0', selectDate],
    )
    .then((data) => helper.sendRocketSuccess('get_lunch_list', username, [data]))
    .catch((error) =>
      helper.sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'getDailyMenuDate',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    );
}

function setDailyMenuDate(sqlite, isPrimary, selectDate, selectList, username) {
  let menuList = [];
  let menuInsert = [];

  sqlite
    .run(`BEGIN`)
    .then(() =>
      sqlite.all(
        `SELECT id, name FROM menu WHERE name IN (${selectList.map(() => '?').join(',')}) AND delete_date = 0`,
        selectList,
      ),
    )
    .then((data) => {
      menuList = data;
      menuInsert = selectList.filter((n) => !menuList.map((m) => m.name).includes(n));

      return true;
    })
    .then(() =>
      Promise.map(menuInsert, (v) =>
        sqlite.run(`INSERT INTO menu (name, insert_date) VALUES (?, ?)`, [v, helper.getDate()]),
      ),
    )
    .then((data) => data.map((v) => menuList.push({ id: v.stmt.lastID })))
    .then(() =>
      sqlite.run(`INSERT INTO daily (order_date, is_primary, insert_date) VALUES (?, ?, ?)`, [
        selectDate,
        isPrimary ? '1' : '0',
        helper.getDate(),
      ]),
    )
    .then((data) =>
      Promise.map(menuList, (v) =>
        sqlite.run(`INSERT INTO daily_menu (daily_id, menu_id, insert_date) VALUES (?, ?, ?)`, [
          data.stmt.lastID,
          v.id,
          helper.getDate(),
        ]),
      ),
    )
    .then(() => sqlite.run(`COMMIT`))
    .then(() => helper.sendRocketSuccess('set_lunch_list_date', username))
    .catch((error) =>
      Promise.all([
        sqlite.run('ROLLBACK'),
        helper.sendRocketFail('error', username, [
          {
            key: 'code',
            value: 'setDailyMenuDate',
          },
          {
            key: 'database',
            value: error.message.toString(),
          },
        ]),
      ]),
    );
}

function deleteLunchListDate(sqlite, selectDate, username) {
  sqlite
    .run(`UPDATE lunch_list SET delete_date = ? WHERE order_date = ? AND delete_date = 0`, [
      helper.getDate(),
      Number(selectDate),
    ])
    .then(() => helper.sendRocketSuccess('remove_lunch_list_date', username))
    .catch((error) =>
      helper.sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'update_remove_lunch_list_date',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    );
}

function updateLunchNext(sqlite, type, oid, lunch, username, channelId, messageId) {
  let rocketMessageId;
  let rocketRoomId;

  sqlite
    .all(
      `SELECT o.lunch_list_id, o.lunch, o.rocket_message_id, o.rocket_room_id, p.username FROM lunch_order o, person p WHERE o.person_id = p.id AND o.id = ? AND o.delete_date = 0`,
      [oid],
    )
    .then((data) => {
      /**
       * @property lunch_list_id
       * @property lunch
       * @property rocket_message_id
       * @property rocket_room_id
       * @property username
       */
      if (!data.length) return helper.sendRocketFail('lunch_next', username);
      else if (data.length && data[0].username !== username) return helper.sendRocketFail('no_permission', username);
      else if (data.length && data[0].lunch) return helper.sendRocketWarning('lunch_next', username);

      rocketMessageId = data[0].rocket_message_id;
      rocketRoomId = data[0].rocket_room_id;

      return sqlite.all(`SELECT list FROM lunch_list WHERE id = ? AND delete_date = 0`, [data[0].lunch_list_id]);
    })
    .then((data) => {
      if (!data) return;
      else if (!data.length) return helper.sendRocketFail('lunch_next', username);
      else if (type !== 'no' && data[0].list.split(/\|/g).indexOf(lunch) === -1)
        return helper.sendRocketFail('lunch_next_list', username);

      return sqlite.run(`UPDATE lunch_order SET lunch = ? WHERE id = ? AND lunch ISNULL`, [lunch, oid]);
    })
    .then((data) => {
      if (!data) return;

      helper.deleteLunchRequest(rocketRoomId, rocketMessageId);

      return true;
    })
    .then((data) => {
      if (data) {
        const { property } = helper.nextDateInfo();
        property.formatPersian = true;
        return helper.sendRocketSuccess('lunch_next', username, [lunch, oid, property.format('DD-MM-YYYY')]);
      }

      return true;
    })
    .catch((error) =>
      helper.sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'update_lunch_next',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    )
    .then(() => helper.sendRocketDelete(channelId, messageId, false))
    .catch((error) => logger.error(error.message.toString()));
}

function againLunchNext(sqlite, username, count = 1) {
  const minuteLimit = config.get('custom.order.minuteLimit');
  const insertDate = Number(helper.getDate().substr(0, 8));
  const finishDate = new persianDate().add('minute', minuteLimit * count);
  const { weekDay, date } = helper.nextDateInfo();

  Promise.all([
    sqlite.all(
      `SELECT id, username FROM person WHERE delete_date = 0 EXCEPT SELECT p.id, p.username FROM lunch_order o, person p WHERE o.person_id = p.id AND o.insert_date / 1000000000 = ? AND o.delete_date = 0 AND p.delete_date = 0`,
      [insertDate],
    ),
    sqlite.all(`SELECT id, list FROM lunch_list WHERE order_date = ? AND delete_date = 0`, [weekDay]),
    sqlite.all(`SELECT id, list FROM lunch_list WHERE order_date = ? AND delete_date = 0`, [date]),
  ])
    .then(([person, listWeek, listToday]) => {
      const newUserOrder = [];
      for (let i = 0; i < person.length; i++)
        newUserOrder.push({
          id: '',
          person: { id: person[i].id, username: person[i].username },
          listWeek,
          listToday,
        });

      for (let i = 0; i < count; i++) setTimeout(run.bind(null, i, newUserOrder), i * minuteLimit * 60 * 900);

      return true;
    })
    .catch((error) =>
      helper.sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'lunch_next_again',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    );

  function run(attempt, newUserOrder) {
    const orderInfo = [];

    if (attempt === 0) newUserOrder.map((v) => orderInfo.push(v));

    sqlite
      .all(
        `SELECT o.id, o.person_id, p.username, o.lunch_list_id, l.list FROM lunch_order o, person p, lunch_list l WHERE o.person_id = p.id AND o.lunch_list_id = l.id AND o.insert_date / 1000000000 = ? AND o.lunch ISNULL AND o.delete_date = 0`,
        [insertDate],
      )
      .then(async (data) => {
        if (!data.length && !orderInfo.length) {
          await helper.sendRocketWarning('lunch_next_again', username);

          return true;
        }

        for (let i = 0; i < data.length; i++)
          orderInfo.push({
            id: data[i].id,
            person: { id: data[i].person_id, username: data[i].username },
            listWeek: [],
            listToday: [{ id: data[i].lunch_list_id, list: data[i].list }],
          });

        return true;
      })
      .then(() => sqlite.run(`BEGIN`))
      .then(() =>
        Promise.map(orderInfo, (v) => sendNewLunchAgain(v.id, v.person, v.listWeek, v.listToday, attempt === 0)),
      )
      .then(() => (attempt === 0 ? helper.updateOrderProcessFinish(sqlite, finishDate) : true))
      .then(() => sqlite.run(`COMMIT`))
      .then(() => helper.sendRocketSuccess('lunch_next_again', username, [orderInfo.length]))
      .catch((error) =>
        Promise.all([
          sqlite.run('ROLLBACK'),
          helper.sendRocketFail('error', username, [
            {
              key: 'code',
              value: 'lunch_next_again',
            },
            {
              key: 'database',
              value: error.message.toString(),
            },
          ]),
        ]),
      )
      .catch((error) => logger.error(error.message.toString()));
  }

  function sendNewLunchAgain(oid, person, listWeek, listToday, change) {
    return sqlite
      .run(`UPDATE lunch_order SET delete_date = ? WHERE id = ?`, [helper.getDate(), oid])
      .then(() => helper.sendLunchRequest(sqlite, person, listWeek, listToday, change))
      .then((data) => {
        if (!data) return;

        setTimeout(() => {
          helper.deleteLunchRequest(data.roomId, data.messageId);
        }, minuteLimit * 60 * 800);

        return true;
      });
  }
}

function resetLunchNext(sqlite, oid, username) {
  let start = false;
  const info = {};

  sqlite
    .all(
      `SELECT o.person_id, p.username, o.lunch_list_id, l.list FROM lunch_order o, person p, lunch_list l WHERE o.person_id = p.id AND o.lunch_list_id = l.id AND o.id = ? AND o.delete_date = 0`,
      [oid],
    )
    .then((data) => {
      if (!data.length) return helper.sendRocketFail('lunch_next', username);

      /**
       * @property person_id
       * @type {{id: *, username: string}}
       */
      info.person = { id: data[0].person_id, username: data[0].username };
      info.list = [];
      info.list.push({ id: data[0].lunch_list_id, list: data[0].list });
      start = true;

      return sqlite.run('BEGIN');
    })
    .then(
      () => (start ? sqlite.run(`UPDATE lunch_order SET delete_date = ? WHERE id = ?`, [helper.getDate(), oid]) : null),
    )
    .then(() => (start ? helper.sendLunchRequest(sqlite, info.person, info.list, []) : null))
    .then(() => (start ? sqlite.run('COMMIT') : null))
    .then(() => (start ? helper.sendRocketSuccess('lunch_next_reset', username, [oid]) : null))
    .catch((error) => {
      if (!start) return;

      return Promise.all([
        sqlite.run('ROLLBACK'),
        helper.sendRocketFail('error', username, [
          {
            key: 'code',
            value: 'reset_lunch_next',
          },
          {
            key: 'database',
            value: error.message.toString(),
          },
        ]),
      ]);
    })
    .catch((error) => logger.error(error.message.toString()));
}

function getOrderList(sqlite, roomId, username) {
  const insertDate = Number(helper.getDate().substr(0, 8));
  const pickDate = new persianDate().format('DD-MM-YYYY');
  const output = `./storage/temp/سفارشات ${pickDate}.xlsx`;

  Promise.all([
    sqlite.all(
      `SELECT p.username, p.name, l.order_date, l.list, o.lunch FROM lunch_order o, person p, lunch_list l WHERE o.person_id = p.id AND o.lunch_list_id = l.id AND o.insert_date / 1000000000 = ? AND o.delete_date = 0`,
      [insertDate],
    ),
    Populate.fromFileAsync(config.get('custom.excelTemplate.orderList.fa')),
  ])
    .then(([data, workbook]) => {
      const sheet = workbook.sheet('Sheet1');

      if (data.length) {
        const orderDate = data[0].order_date;
        switch (orderDate) {
          case 10:
            sheet.cell('C4').value(`هفته فرد (شنبه)`);
            break;
          case 11:
            sheet.cell('C4').value(`هفته فرد (یکشنبه)`);
            break;
          case 12:
            sheet.cell('C4').value(`هفته فرد (دوشنبه)`);
            break;
          case 13:
            sheet.cell('C4').value(`هفته فرد (سه‌شنبه)`);
            break;
          case 14:
            sheet.cell('C4').value(`هفته فرد (چهارشنبه)`);
            break;
          case 20:
            sheet.cell('C4').value(`هفته زوج (شنبه)`);
            break;
          case 21:
            sheet.cell('C4').value(`هفته زوج (یکشنبه)`);
            break;
          case 22:
            sheet.cell('C4').value(`هفته زوج (دوشنبه)`);
            break;
          case 23:
            sheet.cell('C4').value(`هفته زوج (سه‌شنبه)`);
            break;
          case 24:
            sheet.cell('C4').value(`هفته زوج (چهارشنبه)`);
            break;
          default:
            sheet.cell('C4').value(new persianDate(helper.convertDateToPersian(orderDate)).format('dddd DD-MM-YYYY'));
        }

        /**
         *
         * @type {Array}
         */
        let noneRocketUser;
        try {
          // eslint-disable-next-line
          noneRocketUser = require('../build/none-rocket-user.json');

          for (let i = 0; i < noneRocketUser.length; i++) {
            noneRocketUser[i].username = '';
            noneRocketUser[i].lunch = null;
          }
        } catch (e) {
          noneRocketUser = [];
        }

        const personLunch = noneRocketUser.concat(data);

        let lunchList = [];
        for (let i = 0; i < personLunch.length; i++) {
          if (!personLunch[i].lunch) continue;
          if (lunchList.indexOf(personLunch[i].lunch) === -1) lunchList.push(personLunch[i].lunch);
        }
        lunchList = lunchList.sort().reverse();

        sheet
          .cell(`I8`)
          .value(0)
          .formula(`=COUNTA(D4:D${personLunch.length})`);
        sheet
          .cell(`I10`)
          .value(0)
          .formula(`=COUNTIF(D4:D${personLunch.length},"")`);

        let countIndex = 1;
        let tablePos = 4;
        for (let i = 0; i < personLunch.length; i++) {
          if (personLunch[i].lunch) continue;
          // const posLunch = lunchList.indexOf(personLunch[i].lunch);

          sheet.cell(`A${tablePos}`).value(countIndex++);
          sheet.cell(`B${tablePos}`).value(personLunch[i].username);
          sheet.cell(`C${tablePos}`).value(personLunch[i].name);
          // sheet.cell(`D${tablePos}`).value(personLunch[i].lunch ? posLunch : '');
          sheet.cell(`D${tablePos}`).value('');
          sheet.range(`A${tablePos}:D${tablePos}`).style({ fontSize: 12 });

          sheet.range(`A${tablePos}:C${tablePos}`).style('fill', 'bf0000');

          tablePos++;
        }

        for (let i = 0; i < lunchList.length; i++)
          for (let j = 0; j < personLunch.length; j++) {
            if (lunchList[i] !== personLunch[j].lunch) continue;

            sheet.cell(`A${tablePos}`).value(countIndex++);
            sheet.cell(`B${tablePos}`).value(personLunch[j].username);
            sheet.cell(`C${tablePos}`).value(personLunch[j].name);
            sheet.cell(`D${tablePos}`).value(i);
            sheet.range(`A${tablePos}:D${tablePos}`).style({ fontSize: 12 });

            tablePos++;
          }

        let listPost = 16;
        sheet.range(`G${listPost}:H${listPost + lunchList.length * 2 - 1}`).merged(true);

        for (let i = 0; i < lunchList.length; i++) {
          sheet.range(`I${listPost}:I${listPost + 1}`).merged(true);
          sheet
            .cell(`I${listPost}`)
            .value(i)
            .style({
              horizontalAlignment: 'center',
              verticalAlignment: 'center',
            });

          sheet.range(`J${listPost}:J${listPost + 1}`).merged(true);
          sheet
            .cell(`J${listPost}`)
            .value(lunchList[i])
            .style({
              horizontalAlignment: 'center',
              verticalAlignment: 'center',
            });

          sheet.range(`K${listPost}:K${listPost + 1}`).merged(true);
          sheet
            .cell(`K${listPost}`)
            .value(0)
            .style({
              horizontalAlignment: 'center',
              verticalAlignment: 'center',
            })
            .formula(`=COUNTIF(D4:D500,"${i}")`);

          listPost += 2;
        }
      }

      return workbook.toFileAsync(output);
    })
    /**
     * @property rid
     */
    .then(() => helper.uploadFile(output, roomId, [pickDate]))
    .catch((error) =>
      helper.sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'get_order_list',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    )
    .delay(60000)
    .then(() => fs.unlinkAsync(output))
    .catch((error) => logger.error(error.message.toString()));
}

function getUser(sqlite, username) {
  sqlite
    .all(`SELECT id, username, name FROM person WHERE delete_date = 0`)
    .then((data) => helper.sendRocketSuccess('get_user', username, [data]))
    .catch((error) =>
      helper.sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'get_user',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    )
    .catch((error) => logger.error(error.message.toString()));
}

function setUser(sqlite, person, username) {
  let start = false;
  const param = [person.username.replace('@', '').trim(), person.name, helper.getDate()];

  helper
    .getUserInfo(person.username)
    .then(() => (start = true))
    .catch((error) => {
      const output = [];
      output.push({ key: 'code', value: 'set_user' });
      if (error.message.toString().match(/error-invalid-user/))
        output.push({ key: 'rocket-chat', value: 'error-invalid-user' });
      else output.push({ key: 'rocket-chat', value: error.message.toString() });

      return helper.sendRocketFail('error', username, output);
    })
    .then(() => (start ? sqlite.run(`INSERT INTO person (username, name, insert_date) VALUES (?, ?, ?)`, param) : null))
    .then(() => (start ? helper.sendRocketSuccess('set_user', username) : null))
    .catch((error) =>
      helper.sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'get_user',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    )
    .catch((error) => logger.error(error.message.toString()));
}

function removeUser(sqlite, person, username) {
  const update = {
    condition: null,
    value: null,
  };
  if (person.indexOf('@') === -1) {
    update.condition = 'id';
    update.value = !isNaN(Number(person)) ? Number(person) : -1;
  } else {
    update.condition = 'username';
    update.value = person.replace('@', '').trim();
  }

  sqlite
    .run(`UPDATE person SET delete_date = ? WHERE ${update.condition} = ? AND delete_date = 0`, [
      helper.getDate(),
      update.value,
    ])
    .then((data) => {
      const func = data.stmt.changes === 0 ? helper.sendRocketWarning : helper.sendRocketSuccess;

      return func('remove_user', username);
    })
    .catch((error) =>
      helper.sendRocketFail('error', username, [
        {
          key: 'code',
          value: 'get_user',
        },
        {
          key: 'database',
          value: error.message.toString(),
        },
      ]),
    );
}

function changeCurrentOrders(sqlite, hour, minute, lunchList, username) {
  const insertDate = Number(helper.getDate().substr(0, 8));
  const minuteLimit = config.get('custom.order.minuteLimit');
  const nowTime = new persianDate();
  const endTime = new persianDate().hour(hour).minute(minute);
  const attempt = Math.round(nowTime.diff(endTime, 'minute') / minuteLimit);
  const { date } = helper.nextDateInfo();

  sqlite
    .run('BEGIN')
    .then(() =>
      sqlite.run(`UPDATE lunch_order SET delete_date = ? WHERE insert_date / 1000000000 = ? AND delete_date = 0`, [
        helper.getDate(),
        insertDate,
      ]),
    )
    .then(() =>
      sqlite.run(
        `UPDATE lunch_list SET delete_date = ? WHERE order_date = ? AND insert_date / 1000000000 = ? AND delete_date = 0`,
        [helper.getDate(), date, insertDate],
      ),
    )
    .then(() =>
      sqlite.run(`INSERT INTO lunch_list (order_date, list, insert_date) VALUES (?, ?, ?)`, [
        date,
        lunchList,
        helper.getDate(),
      ]),
    )
    .then(() => sqlite.run('COMMIT'))
    .then(() => {
      setTimeout(() => againLunchNext(sqlite, username, attempt), 300);

      return true;
    })
    .catch((error) =>
      Promise.all([
        sqlite.run('ROLLBACK'),
        helper.sendRocketFail('error', username, [
          {
            key: 'code',
            value: 'change_current_orders',
          },
          {
            key: 'database',
            value: error.message.toString(),
          },
        ]),
      ]),
    )
    .catch((error) => logger.error(error.message.toString()));
}

module.exports = {
  downloadExcelLunch,
  downloadExcelUser,
  getDailyMenu,
  getDailyMenuDate,
  setDailyMenuDate,
  deleteLunchListDate,
  updateLunchNext,
  againLunchNext,
  resetLunchNext,
  getOrderList,
  getUser,
  setUser,
  removeUser,
  changeCurrentOrders,
};
