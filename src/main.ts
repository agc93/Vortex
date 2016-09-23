/**
 * entry point for the main process
 */

import 'source-map-support/register';

import { setMaximized, setWindowPosition, setWindowSize } from './actions/window';
import reducer from './reducers/index';
import { IState, IWindow } from './types/IState';
import GameModeManager from './util/GameModeManager';
import { log } from  './util/log';

import * as Promise from 'bluebird';
import { BrowserWindow, app } from 'electron';
import * as fs from 'fs-extra-promise';
import * as path from 'path';
import { applyMiddleware, compose, createStore } from 'redux';
import { electronEnhancer } from 'redux-electron-store';
import { autoRehydrate, persistStore } from 'redux-persist';
import { AsyncNodeStorage } from 'redux-persist-node-storage';
import thunkMiddleware from 'redux-thunk';
import * as winston from 'winston';

import ExtensionManager from './util/ExtensionLoader';

import doRestart = require('electron-squirrel-startup');

if (doRestart) {
  app.quit();
}

// install developer tool extensions

const installExtensions: Function = () => {
  return new Promise((resolved, reject) => {
    if (process.env.NODE_ENV === 'development') {
      const installExtension = require('electron-devtools-installer');
      const { REACT_DEVELOPER_TOOLS, REACT_PERF } = require('electron-devtools-installer');

      try {
        installExtension.default(REACT_DEVELOPER_TOOLS)
          .then((name) => log('info', 'Added Extension', name))
          .catch((err) => log('error', 'An error occurred: ', { error: err }));

        installExtension.default(REACT_PERF)
          .then((name) => log('info', 'Added Extension', name))
          .catch((err) => log('error', 'An error occurred: ', { error: err }));
      } catch (e) {
        console.error(e);
      }
    }
    resolved();
  });
};

let basePath: string = app.getPath('userData');

fs.ensureDirSync(basePath);

log('info', `using ${basePath} as the storage directory`);

// set up logging

winston.add(winston.transports.File, {
  filename: path.join(basePath, 'nmm2.log'),
  json: false,
  level: 'debug',
  maxsize: 1024 * 1024,
  maxFiles: 5,
  tailable: true,
  timestamp: () => new Date().toUTCString(),
});

if (process.env.NODE_ENV !== 'development') {
  winston.remove(winston.transports.Console);
}

// set up store and persisting

const middleware = [
  thunkMiddleware,
];

const enhancer: Redux.StoreEnhancer<IState> = compose(
  applyMiddleware(...middleware),
  autoRehydrate(),
  electronEnhancer()
) as Redux.StoreEnhancer<IState>;

const extensions: ExtensionManager = new ExtensionManager();

const extReducers = extensions.getReducers();

const store: Redux.Store<IState> = createStore<IState>(reducer(extReducers), enhancer);
persistStore(store, {
    storage: new AsyncNodeStorage(path.join(basePath, 'state')),
    whitelist: ['window', 'settings', 'account'],
  },
  () => { log('info', 'Application state loaded'); }
);

const gameModeManager: GameModeManager = new GameModeManager(basePath);
gameModeManager.attachToStore(store);
gameModeManager.startQuickDiscovery();

extensions.setStore(store);

// main window setup

let mainWindow: Electron.BrowserWindow = null;

function createWindow() {
  let windowMetrics: IWindow = store.getState().window;
  mainWindow = new BrowserWindow({
    height: windowMetrics.size.height,
    width: windowMetrics.size.width,
    x: windowMetrics.position.x,
    y: windowMetrics.position.y,
    autoHideMenuBar: true,
    show: false,
    title: 'NMM2',
  });

  if (windowMetrics.maximized) {
    mainWindow.maximize();
  }

  mainWindow.loadURL(`file://${__dirname}/index.html`);
  // opening the devtools automatically can be very useful if the renderer has
  // trouble loading the page
  // mainWindow.webContents.openDevTools();

  mainWindow.once('ready-to-show', () => {
    log('info', 'ready to show');
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.on('maximize', () => {
    store.dispatch(setMaximized(true));
  });

  mainWindow.on('unmaximize', () => {
    store.dispatch(setMaximized(false));
  });

  mainWindow.on('resize', () => {
    let size: number[] = mainWindow.getSize();
    store.dispatch(setWindowSize({ width: size[0], height: size[1] }));
  });

  mainWindow.on('move', (evt) => {
    let pos: number[] = mainWindow.getPosition();
    store.dispatch(setWindowPosition({ x: pos[0], y: pos[1] }));
  });
}

const shouldQuit: boolean = app.makeSingleInstance((commandLine, workingDirectory): boolean => {
  // This is a second instance, instead of starting a new one, bring the existing one to front
  if (mainWindow !== null) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore();
    }
    mainWindow.focus();
  }
  return true;
});

if (shouldQuit) {
  app.quit();
}

app.on('ready', () => {
  installExtensions().then(createWindow);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
