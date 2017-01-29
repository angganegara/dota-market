#!/usr/bin/env node
"use strict"

const axios   = require('axios')
const chalk   = require('chalk')
const rainbow = require('chalk-rainbow')
const blessed = require("blessed")
const contrib = require("blessed-contrib")
const moment  = require('moment')

const TIME_MS = 1
const TIME_SEC = TIME_MS * 1000
const TIME_MIN = TIME_SEC * 60
const TIME_HOUR = TIME_MIN * 60

var prevLowestPrice
const prices = {
    lowest: [],
    median: []
}

// command line options
var itemName
var interval = 30 // in seconds
var currencyCode = 10 // 10 = IDR, 1 = USD
var priceLimit

// parse command line
process.argv.forEach((arg, i, argv) => {
    switch (arg) {
        case "--name":
            itemName = argv[i + 1]
            break
        case "--currency":
            currencyCode = argv[i + 1]
            break
        case "--interval":
            interval = parseInt(argv[i + 1])
            break
        case "--price":
            priceLimit = parseInt(argv[i + 1])
            break
    }
})

// create dashboard class
class Dashboard {

    constructor() {
        this.widgets = {}

        // configure blessed
        this.screen = blessed.screen({
            title: 'Dota 2 Market',
            autoPadding: true,
            dockBorders: true,
            fullUnicode: true,
            smartCSR: true
        })

        this.screen.key(["escape", "q", "C-c"], (ch, key) => process.exit(0))

        this.grid = new contrib.grid({
            screen: this.screen,
            rows: 12,
            cols: 12
        })

        this.graphs = {
            prices: {
                title: "Price",
                x: [],
                y: [],
                style: {
                    line: 'red'
                }
            },
        }

        // Shared settings
        const shared = {
            border: {
                type: 'line'
            },
            style: {
                fg: 'blue',
                text: 'blue',
                border: {
                    fg: 'green'
                }
            }
        }

        // Widgets
        const widgets = {
            settings: {
                type: contrib.log,
                size: {
                    width: 3,
                    height: 3,
                    top: 0,
                    left: 9
                },
                options: Object.assign({}, shared, {
                    label: "Settings",
                    padding: {
                        left: 1
                    }
                })
            },
            graph: {
                type: contrib.line,
                size: {
                    width: 12,
                    height: 4,
                    top: 5,
                    left: 0
                },
                options: Object.assign({}, shared, {
                    label: "Prices",
                    showLegend: false,
                    legend: {
                        width: 20
                    }
                })
            },
            log: {
                type: contrib.log,
                size: {
                    width: 12,
                    height: 3,
                    top: 9,
                    left: 0
                },
                options: Object.assign({}, shared, {
                    label: "Log",
                    padding: {
                        left: 1
                    }
                })
            }
        }

        // create a contrib widget
        for (let name in widgets) {
            let widget = widgets[name]

            this.widgets[name] = this.grid.set(
                widget.size.top,
                widget.size.left,
                widget.size.height,
                widget.size.width,
                widget.type,
                widget.options
            )
        }
    }

    /**
     * Render screen
     *
     * @return {Void}
     */
    render() {
        this.screen.render()
    }

    /**
     * Plot graph data
     *
     * @param {Arr} prices
     *
     * @return {Void}
     */
    plot(prices) {
        const now = new moment().format('dddd DD MMM YY HH:mm:ss')
        const data = []

        Object.assign(this.graphs.prices, {
            x: [...this.graphs.prices.x, now],
            y: [...this.graphs.prices.y, prices.price]
        })

        data.push(this.graphs.prices)

        this.widgets.graph.setData(data)
    }

    /**
     * Log data
     *
     * @param {Arr} messages
     *
     * @return {Void}
     */
    log(messages) {
        const now = new moment().format('dddd DD MMM YY HH:mm:ss')
        messages.forEach((m) => this.widgets.log.log(`${now}: ${m}`))
    }

    /**
     * Display settings
     *
     * @param {Arr} config
     *
     * @return {Void}
     */
    settings(config) {
        config.forEach((c) => this.widgets.settings.add(c))
    }
}

const parsePrice = (priceText) => {
    const matches = priceText.split(' ').join('').replace(/[a-zA-Z]/g, '')
    return parseFloat(matches)
}

// spawn new dashboard
const dashboard = new Dashboard()
dashboard.settings([
    `Item Name: ${itemName}`,
    `Currency Code: ${currencyCode}`,
    `Price limit: ${priceLimit}`
].filter(s => s))

const fetch = () => {
    const STEAM_URL = `http://steamcommunity.com/market/priceoverview/?appid=570&currency=${currencyCode}&market_hash_name=${itemName}`

    axios.get(STEAM_URL).then((res) => {
        const lowest_price = parsePrice(res.data.median_price)
        prices.lowest.push(lowest_price)
    })
    .then(() => {
        const lowestPrice = Math.min(...prices.lowest)
        var pricesAreValid = true

        // clear previous prices
        prices.lowest = []

        const lowestPriceDiff = prevLowestPrice - lowestPrice
        var lowestPriceDiffString = ''

        // create a string to show the price difference
        if (!isNaN(lowestPriceDiff)) {
            if (!isFinite(lowestPriceDiff)) {
                pricesAreValid = false
            }
        }

        if (lowestPriceDiff > 0) {
            lowestPriceDiffString = chalk.green(`(down ${Math.abs(lowestPriceDiff)})`)
        } else if (lowestPriceDiff < 0) {
            lowestPriceDiffString = chalk.red(`(up ${Math.abs(lowestPriceDiff)})`)
        } else if (lowestPriceDiff === 0) {
            lowestPriceDiffString = chalk.blue(`(no change)`)
        }

        if (pricesAreValid) {
            // store current price for next time
            prevLowestPrice = lowestPrice

            // price on steam market is higher than what we want
            // time to sell the item !
            const awesomeDeal = prevLowestPrice > priceLimit

            if (awesomeDeal) {
                const message = `Deal alert! the average price for the Item you specified is higher than your asking price. Time to sell it quick.`

                dashboard.log([
                    rainbow(message)
                ])
            }

            dashboard.log([
                `Highest price for the item you specified is currently ${[lowestPrice].filter(i => i).join(" ")}`
            ])

            dashboard.plot({
                price: lowestPrice
            })
        }

        dashboard.render()

        setTimeout(fetch, interval * TIME_SEC)
    })
}

fetch()
