import { pretty, splitToJson } from './transform';
import * as fs from 'fs';
import SlackIntegration from './SlackIntegration';
import LineIntegration from './LineIntegration';
import { SlackConfig, LineConfig } from '../types';
import { getConfigRoot } from '../configUtil';
import * as mkdirp from 'mkdirp';
import * as _ from 'lodash';
import * as WebSocket from 'ws';
import { wssLogPort } from '../constants';
import * as express from 'express';
import { Server as httpServer } from 'http';

let wss: WebSocket.Server;
let app: express.Express;
let server: httpServer;

process.on('SIGINT', () => {
  if (wss) {
    wss.close();
  }
  if (server) {
    server.close();
  }
});

const logdir = './logs';
mkdirp.sync(logdir);

let configRoot;

try {
  configRoot = getConfigRoot();
} catch (ex) {
  console.log(ex.message);
}

// console output
process.stdin.pipe(pretty({ colorize: true, withLabel: false, debug: false, hidden: false })).pipe(process.stdout);

// debug.log
const debugFile = fs.createWriteStream('logs/debug.log', { flags: 'w' });
process.stdin.pipe(pretty({ colorize: false, withLabel: true, debug: true, hidden: false })).pipe(debugFile);

// info.log
const infoTransform = process.stdin.pipe(pretty({ colorize: false, withLabel: true, debug: false, hidden: false }));
const infoFile = fs.createWriteStream('logs/info.log', { flags: 'a' });
infoTransform.pipe(infoFile);

// notification integrations
if (configRoot) {
  const slackConfig = _.get(configRoot, 'logging.slack');
  const lineConfig = _.get(configRoot, 'logging.line');
  addIntegration(SlackIntegration, slackConfig);
  addIntegration(LineIntegration, lineConfig);
}

// websocket integration
const webGatewayConfig = _.get(configRoot, 'webGateway');
if (webGatewayConfig && webGatewayConfig.enabled) {
  const clients: WebSocket[] = [];
  const wsTransform = process.stdin.pipe(splitToJson());
  app = express();
  server = app.listen(wssLogPort, webGatewayConfig.host, () => {
    _.noop();
  });
  wss = new WebSocket.Server({ server });
  wss.on('connection', ws => {
    ws.on('error', err => {
      _.noop();
    });
    clients.push(ws);
  });
  wsTransform.on('data', line => {
    if (!line) {
      return;
    }
    try {
      broadcast(clients, 'log', line);
    } catch (err) {
      _.noop();
    }
  });
}

function broadcast(clients: WebSocket[], type: string, body: any) {
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type, body }), err => {
        if (err) {
          _.pull(clients, client);
        }
      });
    }
  }
}

function addIntegration(
  Integration: { new (config: any): SlackIntegration | LineIntegration },
  config: SlackConfig | LineConfig | undefined
): void {
  if (config && config.enabled) {
    const integration = new Integration(config);
    infoTransform.on('data', line => integration.handler(line as string));
  }
}
