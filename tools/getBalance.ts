// Ad-hoc script to get balances from exchanges and output the result in CSV format.

import * as _ from 'lodash';
import { getConfigRoot, findBrokerConfig } from '../src/configUtil';
import BitflyerApi from '../src/Bitflyer/BrokerApi';
import CoincheckApi from '../src/Coincheck/BrokerApi';
import QuoineApi from '../src/Quoine/BrokerApi';
import { Balance } from '../src/Bitflyer/types';
import { TradingAccount, AccountBalance } from '../src/Quoine/types';
import { options } from '@bitr/logger';

options.enabled = false;

async function main() {
  const config = getConfigRoot();
  const bfConfig = findBrokerConfig(config, 'Bitflyer');
  const bfFxConfig = findBrokerConfig(config, 'BitflyerFX')
  const ccConfig = findBrokerConfig(config, 'Coincheck');
  const quConfig = findBrokerConfig(config, 'Quoine');

  const bfApi = new BitflyerApi(bfConfig.key, bfConfig.secret);
  const ccApi = new CoincheckApi(ccConfig.key, ccConfig.secret);
  const quApi = new QuoineApi(quConfig.key, quConfig.secret);

  // csv header
  process.stdout.write('Exchange, Currency, Type, Amount\n');

  var allBalance = 0;
  var allCash = 0;
  var allBtc = 0;
  var btcRate = 0;

  // bitflyer cash balance
  if (bfConfig.enabled) {
    const bfBalance = await bfApi.getBalance();
    const bfJpy = (bfBalance.find(x => x.currency_code === 'JPY') as Balance).available;
    const bfBtc = (bfBalance.find(x => x.currency_code === 'BTC') as Balance).available;
    process.stdout.write(`bitFlyer, JPY, Cash, ${_.round(bfJpy)}\n`);
    process.stdout.write(`bitFlyer, BTC, Cash, ${bfBtc}\n`);
  }

  // bitflyer collateral balance
  if (bfFxConfig.enabled) {
    const bfFxBalance = await bfApi.getCollateral();
    const bfFxJpy = bfFxBalance.collateral;
    const bfFxPnl = bfFxBalance.open_position_pnl;
    process.stdout.write(`bitFlyer, JPY, Margin, ${_.round(bfFxJpy)}\n`);
    process.stdout.write(`bitFlyer, JPY, PositionPL, ${_.round(bfFxPnl)}\n`);
    allCash += _.round(bfFxJpy) + _.round(bfFxPnl);
  }

  // coincheck cash balance
  if (ccConfig.enabled) {
    const ccBalance = await ccApi.getAccountsBalance();
    if (ccBalance.jpy){
      process.stdout.write(`Coincheck, JPY, Cash, ${_.round(ccBalance.jpy)}\n`);
    }
    if (ccBalance.btc){
      process.stdout.write(`Coincheck, BTC, Cash, ${ccBalance.btc}\n`);
    }
    
    // coincheck margin balance
    const ccLeverageBalance = await ccApi.getLeverageBalance();
    if(ccLeverageBalance.margin.jpy){
      process.stdout.write(`Coincheck, JPY, Margin, ${_.round(ccLeverageBalance.margin.jpy)}\n`);
    }
    if(ccLeverageBalance.margin_available.jpy){
      process.stdout.write(`Coincheck, JPY, Free Margin, ${_.round(ccLeverageBalance.margin_available.jpy)}\n`);
    }
    const positions = await ccApi.getAllOpenLeveragePositions();
    const longPosition = _.sumBy(positions.filter(p => p.side === 'buy'), p => p.amount);
    const shortPosition = _.sumBy(positions.filter(p => p.side === 'sell'), p => p.amount);
    if(0){
      process.stdout.write(`Coincheck, BTC, Leverage Position, ${longPosition - shortPosition}\n`);
    }
    allCash += _.round(ccBalance.jpy + ccLeverageBalance.margin.jpy);
    allBtc += ccBalance.btc;
  }

  if (quConfig.enabled) {
    // quoine cash balance
    const quCashBalance = await quApi.getAccountBalance();
    const quJpyCash = quCashBalance.find(b => b.currency === 'JPY') as AccountBalance;
    const quBtcCash = quCashBalance.find(b => b.currency === 'BTC') as AccountBalance;
    process.stdout.write(`Quoine, JPY, Cash, ${_.round(quJpyCash.balance)}\n`);
    process.stdout.write(`Quoine, BTC, Cash, ${quBtcCash.balance}\n`);

    // quoine margin balance
    const quBalance = await quApi.getTradingAccounts();
    const quBtcJpyBalance = quBalance.find(x => x.currency_pair_code === 'BTCJPY') as TradingAccount;
    if(0){
      process.stdout.write(`Quoine, JPY, Margin, ${_.round(quBtcJpyBalance.balance)}\n`);
      process.stdout.write(`Quoine, JPY, Free Margin, ${_.round(quBtcJpyBalance.free_margin)}\n`);  
      process.stdout.write(`Quoine, BTC, Leverage Position, ${quBtcJpyBalance.position}\n`);
    }

    // quioine btc rate
    try{
      const quPriceLevels = await quApi.getPriceLevels();
      const bids = quPriceLevels.sell_price_levels;
      btcRate = bids[0][0];
      allCash += quJpyCash.balance;
      allBtc += quBtcCash.balance;
    } catch(ex){
      process.stdout.write(`Failire Get Price`);
    }
  }
  allBalance = _.round(allCash + (allBtc * btcRate))
  process.stdout.write(`All, JPY, Estimate, ${allBalance}\n`);
}

main();
