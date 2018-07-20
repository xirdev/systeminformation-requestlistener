import {parse as urlParse} from 'url';

import Moment from 'moment';
import SystemInformation from 'systeminformation';

const DEFAULT_PATH_PREFIX = '/metrics';
const DEFAULT_INTERVAL = 1000;

export default class MetricsListener {

  constructor(apiPath, interval) {

    apiPath = apiPath || DEFAULT_PATH_PREFIX;
    while (apiPath.endsWith('/')) {
      apiPath = apiPath.substring(0, apiPath.length - 1);
    }
    if (!apiPath) {
      apiPath = DEFAULT_PATH_PREFIX;
    }

    if (!Number.isInteger(interval) || interval < 1) {
      interval = DEFAULT_INTERVAL;
    }

    this.apiPath = apiPath;
    this.interval = interval;

    this._initializeDefaults();
    this._initCpuMonitoring();
    this._initNetworkMonitoring();

    return this.requestListener();
  }

  _initializeDefaults() {
    // defaults
    this.requestCount    = 0;
    this.lastCpuData     = {
      'dateCaptured':           0,
      'avgload':                0,
      'currentload':            0,
      'currentload_user':       0,
      'currentload_system':     0,
      'currentload_nice':       0,
      'currentload_idle':       100,
      'currentload_irq':        0,
      'raw_currentload':        0,
      'raw_currentload_user':   0,
      'raw_currentload_system': 0,
      'raw_currentload_nice':   0,
      'raw_currentload_idle':   0,
      'raw_currentload_irq':    0,
      'cpus':                   []
    };
    this.lastNetworkData = {
      'dateCaptured': 0,
      'iface':        'unknown',
      'operstate':    'unknown',
      'rx':           0,
      'tx':           0,
      'rx_sec':       -1,
      'tx_sec':       -1,
      'ms':           0
    };
    this.lastCpuError = null;
    this.lastNetworkError = null;
  }

  _initCpuMonitoring() {

    this.cpuIntervals = 0;
    SystemInformation.currentLoad()
      .then((_ignoreFirst) => {

        // assure we track first call successfully
        this.cpuIntervals++;
        return _ignoreFirst;
      })
      .catch((error) => {

        this.lastCpuError = error;
        // first call failed, doesn't really matter we just want to interval forever
        // allow promise chain to continue
      })
      .then((_ignoreFirst) => {

        setInterval(() => {

          SystemInformation.currentLoad()
            .then((stats) => {

              // only update stats on 2nd call
              if (++this.cpuIntervals > 1) {

                stats['dateCaptured'] = Moment.utc().unix();
                this.lastCpuData      = stats;
                // on success we will remove last error always
                this.lastCpuError     = null;
              }
            })
            .catch((error) => {

              // we can at least propagate this through to caller
              this.lastCpuError = error;
            });

        }, this.interval);
      });
  }

  _initNetworkMonitoring() {

    this.networkIntervals = 0;
    SystemInformation.networkInterfaceDefault()
      .then((nic) => {

        // run network stats once (to initialize tx_sec/rx_sec start values)
        return SystemInformation.networkStats(nic)
          .then((_ignoreFirst) => {

            // assure we track first call successfully
            this.networkIntervals++;
            return _ignoreFirst;
          })
          .catch((error) => {

            this.lastNetworkError = error;
            // first call failed, doesn't really matter we just want to interval forever
            // allow promise chain to continue
          })
          .then((_ignoreFirst) => {

            // begin interval to grab throughput data in background
            setInterval(() => {

              SystemInformation.networkStats(nic)
                .then((stats) => {

                  if (++this.networkIntervals > 1) {

                    stats['dateCaptured'] = Moment.utc().unix();
                    this.lastNetworkData  = stats;
                    this.lastNetworkError = null;
                  }
                });

            }, this.interval);

          });
      })
      .catch((error) => {

        // failed to acquire default interface, that's not good
        this.lastNetworkError = error;
        // attempt to start background interval again after brief wait
        setTimeout(() => {
          this._initNetworkMonitoring();
        }, 1000);
      });
  }

  requestListener() {
    return (req, res) => {

      let urlObj = urlParse(req.url);

      if (urlObj.pathname !== this.apiPath && !urlObj.pathname.startsWith(`${this.apiPath}/`)) {
        // we won't be handling this request at all
        // but we'll still be counting requests
        this.requestCount++;
        return;
      }

      // claim ownership of request ASAP, downstream requestListeners will know to ignore
      req.requestHandled = true;

      switch (urlObj.pathname) {

        case `${this.apiPath}/health`:
          res.statusCode = 200;
          res.end('ok');
          break;

        case `${this.apiPath}/requests/total`:
          successResponse(res, `{"metric": ${this.requestCount}}`);
          break;

        case `${this.apiPath}/cpu`:
          if (this.lastCpuError) {
            errorResponse(res, this.lastCpuError);
          } else {
            successResponse(res, this.lastCpuData);
          }
          break;

        case `${this.apiPath}/memory`:
          SystemInformation.mem()
            .then((memStats) => {
              memStats['dateCaptured'] = Moment.utc().unix();

              successResponse(res, memStats);
            })
            .catch((error) => {
              errorResponse(res, error);
            });
          break;

        case `${this.apiPath}/network`:
          if (this.lastNetworkError) {
            errorResponse(res, this.lastNetworkError);
          } else {
            successResponse(res, this.lastNetworkData);
          }
          break;
        case `${this.apiPath}/network/rx`:
          if (this.lastNetworkError) {
            errorResponse(res, this.lastNetworkError);
          } else {
            successResponse(res, `{"metric": ${this.lastNetworkData.rx}}`);
          }
          break;
        case `${this.apiPath}/network/tx`:
          if (this.lastNetworkError) {
            errorResponse(res, this.lastNetworkError);
          } else {
            successResponse(res, `{"metric": ${this.lastNetworkData.tx}}`);
          }
          break;

        default:
          // ignore health and metric queries for request count
          this.requestCount++;
          // because we are taking full responsibility of handling request, we will return 404
          res.statusCode = 404;
          res.end();
          break;
      }

    };
  }
}

function successResponse(res, stat) {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  let body = typeof stat === 'string'
             ? stat
             : JSON.stringify(stat);
  res.end(body);
}

function errorResponse(res, error) {
  res.statusCode = 500;
  res.setHeader('Content-Type', 'application/json');
  let body = typeof error === 'string'
             ? error
             : JSON.stringify(error);
  res.end(body);
}
