/**
 * Created by pooya on 5/15/18.
 */

/**
 * ------------------------------------------------------------
 * Node module
 * ------------------------------------------------------------
 */

const Fs = require('fs');
const Path = require('path');
const Async = require('async');
const Execute = require('child_process').exec;

/**
 * ------------------------------------------------------------
 * Library module
 * ------------------------------------------------------------
 */

const PackageInfo = require('../package');

/**
 * ------------------------------------------------------------
 * Global variable
 * ------------------------------------------------------------
 */

const NODE_ENV = process.env.NODE_ENV || 'default';
const FILE_NAME = Path.basename(__filename);
const ROOT_PATH = process.argv[1]
  .split('/')
  .reverse()
  .map((v) => (v !== FILE_NAME && v !== __filename.split('/').reverse()[1] ? v : ''))
  .reverse()
  .join('/')
  .slice(0, -2);

// noinspection JSUnusedGlobalSymbols
/**
 * ------------------------------------------------------------
 * Code structure
 * ------------------------------------------------------------
 */

Async.autoInject(
  {
    // Delete error file before execute
    deleteFile: (callback) =>
      Async.parallel(
        [
          (callback) => Fs.unlink('./storage/temp/install_error.log', () => callback()),
          (callback) => Fs.unlink('./storage/temp/update_error.log', () => callback()),
        ],
        callback,
      ),

    // Check exist file
    checkExist: (callback) => Fs.readFile(`./config/${NODE_ENV}.json`, (error) => callback(error)),

    // Check installed in environment, If not install start initial process
    readInstall: (callback) =>
      Fs.readFile(`./storage/temp/install`, 'utf8', (error, data) =>
        callback(null, {
          error,
          data: data || '',
        }),
      ),
    checkInstall: (readInstall, callback) => {
      if (readInstall.error && readInstall.error.errno !== -2) return callback(readInstall.error);
      else if (readInstall.error && readInstall.error.errno === -2) return callback(null, false);
      callback(null, true);
    },
    init: (checkInstall, callback) => {
      if (checkInstall) return callback(null);

      Execute(`NODE_ENV=${NODE_ENV} node ${ROOT_PATH}/scripts/init.js`, (error) => {
        if (error) return callback(error);

        Async.parallel(
          [
            // Touch "install" file
            (callback) =>
              Fs.open(
                './storage/temp/install',
                'w',
                (error, file) => (error ? callback(error) : Fs.close(file, () => callback())),
              ),

            // Touch "update" file
            (callback) =>
              Fs.open(
                './storage/temp/update',
                'w',
                (error, file) => (error ? callback(error) : Fs.close(file, () => callback())),
              ),
          ],
          callback,
        );
      });
    },
    appendInstall: (init, readInstall, callback) => {
      if (readInstall.data.split('\n').indexOf(NODE_ENV) !== -1) return callback(null);

      Execute(
        `NODE_ENV=${NODE_ENV} node ${ROOT_PATH}/scripts/init.js`,
        (stderr) =>
          stderr
            ? callback(stderr)
            : Fs.appendFile('./storage/temp/install', `${NODE_ENV}\n`, 'utf8', (error) => callback(error)),
      );
    },

    // Read update file on find environment value and split base on ":"
    updated: (appendInstall, callback) =>
      Fs.readFile('./storage/temp/update', 'utf8', (error, data) => {
        if (error) return callback(error);

        const updated = data
          .split('\n')
          .filter((v) => v.match(new RegExp(`${NODE_ENV}:v.+`)))
          .map((v) => v.split(':'));
        callback(null, updated);
      }),

    // Read update dir and find file like semantic version
    update: (appendInstall, callback) =>
      Fs.readdir('./storage/update', (error, data) => {
        if (error) return callback(error);

        const update = data.filter((v) => v.match(/^v[0-9]+\.[0-9]+\.[0-9]+/) !== null);
        callback(null, update);
      }),

    // Create update list
    updateList: (updated, update, callback) => {
      const map = {};
      const data = {};

      // Convert current version to x * 10 ^ 2 + y * 10 ^ 1 + z * 10 ^ 0
      const currentVersion = PackageInfo.version
        .split('.')
        .reverse()
        .map((v, i) => Number(v) * Math.pow(10, i))
        .reverse()
        .reduce((n, m) => n + m);
      // Convert array of updated version version to x * 10 ^ 2 + y * 10 ^ 1 + z * 10 ^ 0
      data.updated = updated
        .map((v) => {
          const version = v[1]
            .substr(1)
            .split('.')
            .reverse()
            .map((n, m) => Number(n) * Math.pow(10, m))
            .reverse()
            .reduce((n, m) => n + m);
          map[version] = v;

          return version;
        })
        .sort();
      // Convert queue of update version to x * 10 ^ 2 + y * 10 ^ 1 + z * 10 ^ 0
      data.update = update
        .map((v) => {
          const version = v
            .substr(1)
            .slice(0, -3)
            .split('.')
            .reverse()
            .map((n, m) => Number(n) * Math.pow(10, m))
            .reverse()
            .reduce((n, m) => n + m);
          map[version] = v;

          return version;
        })
        .filter((v) => v <= currentVersion)
        .sort();

      const updateList = data.update.filter((v) => !data.updated.includes(v)).map((v) => map[v].slice(0, -3));

      return callback(null, updateList);
    },
    appendUpdate: (updateList, callback) => {
      Async.everySeries(
        updateList,
        (version, callback) =>
          Execute(`NODE_ENV=${NODE_ENV} node ${ROOT_PATH}/storage/update/${version}.js`, (stderr) => {
            if (stderr) return callback(stderr);
            Fs.appendFile('./storage/temp/update', `${NODE_ENV}:${version}\n`, 'utf8', (error) =>
              callback(error, !error),
            );
          }),
        (error) => callback(error),
      );
    },
  },
  (error) => {
    if (error) {
      if (error.hasOwnProperty('cmd')) {
        if (error.cmd.match('init.js'))
          return Fs.writeFile('./storage/temp/install_error.log', error.message.toString(), () => {
            process.stderr.write('Have error in process init!');
            process.exit(1);
          });

        if (error.cmd.match('/update/'))
          return Fs.writeFile('./storage/temp/update_error.log', error.message.toString(), () => {
            process.stderr.write('Have error in process update!');
            process.exit(1);
          });
      } else process.stderr.write(error.message.toString());

      process.stderr.write('\n');
      process.exit(1);
    }

    process.exit();
  },
);

