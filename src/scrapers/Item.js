const Scraper = require('./Scraper')
const Util = require('../lib')

module.exports = class Item extends Scraper {
    parseUris() {
        return this._langs.map(lang => `https://bdocodex.com/${lang}/item/${this._id}/`)
    }

    getData() {
        // Define a default language.
        const l = Object.keys(this._parsers)[0]
        
        const mapToLang = (func) => {
            const langs = Object.keys(this._parsers)
            const data = langs.reduce((data, l) => {
                data[l] = func(l)
                return data
            }, {})
            if (Object.values(data).every(e => e === null))
                return null
            if (Object.values(data).every(e => e === undefined))
                return undefined
            return data
        }

        return {
            id: this._id,
            icon: this.getIcon(),
            grade: this.getGrade(),
            weight: this.getWeight(),
            stats: this.getStats(),
            prices: this.getPrices(l),
            name: mapToLang(this.getName.bind(this)),
            type: mapToLang(this.getType.bind(this)),
            description: mapToLang(this.getDescription.bind(this)),
            effects: mapToLang(this.getEffects.bind(this)),
            exclusive: mapToLang(this.getExclusive.bind(this))
        }
    }

    getWeight($ = this._parsers[this._langs[0]]) {
        let weight
        $('.category_text').parent().contents().each((i, node) => {
            if (node.type !== 'text')
                return
            weight = Util.trim(node.data)
            if (weight)
                return false
        })
        return Util.sliceFromSubstr(weight, ' ')
    }

    getStats($ = this._parsers[this._langs[0]]) {
        if (!$('#damage').length)
            return undefined

        const stats = {
            damage:     Util.trim($('#damage').text()),
            defense:    Util.trim($('#defense').text()),
            accuracy:   Util.trim($('#accuracy').text()),
            evasion:    Util.trim($('#evasion').text()),
            dreduction: Util.trim($('#dreduction').text()),
        }

        // If all stats are 0, then BDOCodex doesn't show them, so return null.
        if (Object.values(stats).every(val => ['0', '0 ~ 0'].includes(val)))
            return null

        return stats
    }

    getDescription(l, $ = this._parsers[l]) {
        const keyword  = Util.getLangKeyword(l, 'DESCRIPTION')
        const children = $('table.smallertext > tbody > tr:last-child > td').contents().toArray()
        
        const startIdx = children.findIndex(
            node => node.type === 'text' && node.data.indexOf(keyword) > -1
        ) + 1

        let description = ''

        for (let i = startIdx; i < children.length; i++) {
            const { type, name, data } = children[i]

            if (description) {
                // Description always ends when there is a double line break.
                if (type === 'tag' && name === 'br')
                    if (i+1 < children.length && children[i+1].type === 'tag')
                        break

                // Description should end when a new HTML element is found and
                // it already has found a description.
                if (type === 'tag' && name !== 'br')
                    break
                
                // If it starts with one of the special characters, then it's a
                // new topic, or observation.
                if (type === 'text' && (Util.startsWith(data, ['-', '–', '※']) || data.indexOf(':') > 0))
                    break
            } else if (name !== 'br') {
                if (type === 'text')
                    description += Util.trim(data) + '\n'
                else
                    description += Util.trim($(children[i]).text()) + '\n'
            }
        }
        
        return Util.trim(description) || null
    }

    getPrices(l, $ = this._parsers[l]) {
        const children = $('table.smallertext > tbody > tr:last-child > td').contents().toArray()
        const prices   = { buy: null, sell: null, repair: null }

        const buyKeyword    = Util.getLangKeyword(l, 'BUY')
        const sellKeyword   = Util.getLangKeyword(l, 'SELL')
        const repairKeyword = Util.getLangKeyword(l, 'REPAIR')

        const setPrice = (key, keyword, str) => {
            if (!prices[key] && str.indexOf(keyword) > -1)
                prices[key] = Util.sliceFromSubstr(str, keyword)
        }

        for (let i = 0; i < children.length; i++) {
            const { data } = children[i]
            if (!data)
                continue
            setPrice('buy',    buyKeyword,    data)
            setPrice('sell',   sellKeyword,   data)
            setPrice('repair', repairKeyword, data)
        }

        if (Object.values(prices).find(val => val === null))
            return null

        return prices
    }

    getEffects(l, $ = this._parsers[l]) {
        const children = $('#edescription').contents().toArray()
        
        if (!children.length)
            return null

        const keywords = {
            item:     (str) => Util.hasKeyword(str, l, 'effects/ITEM_EFFECTS'),
            set_2:    (str) => Util.hasKeyword(str, l, 'effects/2_SET_EFFECTS'),
            set_3:    (str) => Util.hasKeyword(str, l, 'effects/3_SET_EFFECTS'),
            set_4:    (str) => Util.hasKeyword(str, l, 'effects/4_SET_EFFECTS'),
            set_full: (str) => Util.hasKeyword(str, l, 'effects/FULL_SET_EFFECTS'),
            add:      (str) => Util.hasKeyword(str, l, 'effects/ADDITIONAL_EFFECTS'),
            enhanc:   (str) => Util.hasKeyword(str, l, 'effects/ENHANC_EFFECTS'),
        }

        const getKey = (str) => {
            if (!str)
                return null
            const keys = Object.keys(keywords)
            for (let i = 0; i < keys.length; i++) {
                if (keywords[keys[i]](str))
                    return keys[i]
            }
            return null
        }

        let effects = {}    // Store effects by key.
        let key     = null  // Current key being parsed.
        let item    = ''    // Store item content.

        for (let i = 0; i < children.length; i++) {
            const data    = $(children[i]).text()
            const new_key = getKey(data)

            if (new_key) {
                key = new_key
                effects[key] = []
            }
            else if (data) {
                item += Util.trim(data) + ' '
                if (i === children.length - 1 || children[i+1].name === 'br') {
                    effects[key].push(Util.trim(item))
                    item = ''
                }
            }
        }

        return effects
    }

    getExclusive(l, $ = this._parsers[l]) {
        const children = $('table.smallertext > tbody > tr:last-child > td').contents().toArray()
        const keyword  = Util.getLangKeyword(l, 'description/EXCLUSIVE')

        for (let i = 0; i < children.length; i++) {
            const { data } = children[i]
            if (data && data.indexOf(keyword) > -1)
                return Util.trim(Util.sliceFromSubstr(data, keyword)).split(', ')
        }

        return undefined
    }
}