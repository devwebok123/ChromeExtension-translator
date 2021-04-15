let config = {
    //backend: "http://laravel-chrome-extension.com/",
    backend: "https://api.dokiwi.com/",
    level: 0,
    levels: {
        0: 100,
        1: 100,
        2: 100,
        3: 50
    },
    level_names: {
        0: 'low',
        1: 'low',
        2: 'medium',
        3: 'lot'
    },
    token: false,
    pause_data: {
        duration: 0,
        until: 0
    },
    isPaused: false,
    isEnabled: true,
    host: '',
    site_exclusions: [],
    word_exclusions: {},
    identifier: false,
    user_email: false,
    wordset : 0,
    freq: 0,
    blacklist: [],
    translated_today: {},
    highlightEnabled: true,
    locale: 'pt'
};

function getToday() {
    var today = new Date();
    var dd = today.getDate();
    
    var mm = today.getMonth()+1; 
    var yyyy = today.getFullYear();
    if(dd<10) 
    {
        dd='0'+dd;
    } 
    
    if(mm<10) 
    {
        mm='0'+mm;
    } 
    return mm+'/'+dd+'/'+yyyy;
}

function setUninstallURL()
{
    getIdentifier();
    chrome.runtime.setUninstallURL(config.backend+'uninstalled/'+config.identifier+'/'+config.user_email+'/'+chrome.i18n.getMessage("locale"));
}

let hashDictionary = {};

let action = {
    changeWordSet: function (request) {
        let wordset = parseInt(request.value);

        if (config.wordset != wordset) {
            refreshConfigProperty('wordset', wordset);
            return true;
        }
        return false;
    },
    addTranslationCount: function(request) {
        if (!config.translated_today[config.user_email]) {
            config.translated_today[config.user_email] = {today: getToday(), count: 0};
        }
        if (getToday() == config.translated_today[config.user_email].today) {
            config.translated_today[config.user_email].count += request.value;
            refreshConfigProperty('translated_today', config.translated_today);
        }
        else {
            config.translated_today[config.user_email].today = getToday();
            config.translated_today[config.user_email].count = request.value;
            refreshConfigProperty('translated_today', config.translated_today);
        }
    },
    changeLevel: function (request) {
        let level = parseInt(request.value);
        console.log('changeLevel');
        console.log(level);
        if (config.levels[level]) {
            if (config.level != level)
            {
                action.sendMixpanelEvent({
                    identifier:config.identifier,
                    event:'Translate type',
                    data: {
                        type: config.level_names[level]
                    },
                    people: {
                        'type': config.level_names[level]
                    }
                });
            }
            refreshConfigProperty('level',level);
            console.log('changeLevel config');
            console.log(config);
            return true;
        }
        return false;
    },
    changeFrequency: function (request) {
        refreshConfigProperty('freq', request.value);
    },
    isBusy: false,
    getConfigDictionary: function (request) {
        refreshLocalConfig();
        if (request.host)
            config.host = request.host;
        if (!config.token) {
            config.level = 3;
            config.wordset = 63;
            config.freq = 0.03;
        }
        setIsEnabled(config);
        setUninstallURL();
        
        $.ajax({
            url: config.backend+'api/blacklist',
            method: 'GET'
        }).done(function (response) {
            console.log('api/blacklist');
            response = $.parseJSON(response);
            refreshConfigProperty('blacklist', response.blacklist);
            return {'config':config, 'dictionary':hashDictionary};
        });

        if (config.level > 0 && Object.keys(hashDictionary).length == 0) {
            if (action.isBusy) {
                return false;
            }
            action.isBusy = true;
            $.ajax({
                url: config.backend+'api/dict?level='+config.wordset+'&lang_from='+request.locale,
                headers: config.token ? {Authorization: 'Bearer '+config.token} : {},
                method: 'GET'
            }).done(function (response) {
                console.log('api/dict');
                response = $.parseJSON(response);
                action.setDictionary({
                    value: response.dictionary
                });
                action.isBusy = false;
                refreshConfigProperty('blacklist', response.blacklist);
                return {'config':config, 'dictionary':hashDictionary};
            });
            return false;
        }
        else {
            return {'config':config, 'dictionary':hashDictionary};
        }
    },
    setDictionary: function (request) {
        hashDictionary = {};

        let dictionary = request.value;
        dictionary.forEach( function(item, index) {
            lemma = item.lemma;
            lemfreq = item.lemfreq;
            hashDictionary[item.word] = {lemma, lemfreq, index};
        });
        return true;
    },
    setToken: function (request) {
        refreshConfigProperty('token',request.value);
        refreshConfigProperty('user_email',request.user_email);
        setUninstallURL();
        if (request.value)
            refreshLoginTabs();
        return true;
    },
    getConfig: function(request) {
        console.log('getConfig localStorage config: '+localStorage.getItem('config'));
        refreshLocalConfig();

        user_email = localStorage.getItem('user_email');
        if (!config.translated_today) {
            config.translated_today = {};
        }
        config.translated_today[user_email] = {today: getToday(), count: 0};
        if (request.host)
            config.host = request.host;
        setIsEnabled(config);
        setUninstallURL();
        return config;
    },
    setConfig: function (request) {
        console.log('setConfig: ');
        console.log(request);
        setIsEnabled(request.value);
        for (prop in request.value) {
            refreshConfigProperty(prop, request.value[prop]);
        }
        setUninstallURL();
        if (request.isPausedChange)
        {
            let local_request = {
                identifier: config.identifier,
                data: {
                    //is_disabled: request.value.isPaused,
                    url: request.url
                }
            };
            if (request.value.isPaused)
            {
                local_request.event = 'Disabled';
                local_request.data.duration = request.value.pause_data.duration;

                if (request.value.pause_data.duration < 0)
                    local_request.people = {
                        is_disabled: true
                    };
            }
            else if (request.enabling)
            {
                local_request.event = 'Enabled';
                local_request.peopleUnset = 'is_disabled';
            }
            action.sendMixpanelEvent(local_request);
        }
        return config;
    },
    addExclusion: function(request) {
        refreshLocalConfig();
        if (!config.site_exclusions)
            config.site_exclusions = [];
        if (config.site_exclusions.indexOf(request.value) < 0)
            config.site_exclusions.push(request.value);
        refreshConfigProperty('site_exclusions', config.site_exclusions);

        action.sendMixpanelEvent({
            identifier:config.identifier,
            event:'Allow',
            data: {
                is_turn: 'false',
                url: request.value
            }
        });

        return true;
    },
    removeExclusion: function(request) {
        refreshLocalConfig();
        if (!config.site_exclusions)
            config.site_exclusions = [];
        let position = config.site_exclusions.indexOf(request.value);
        if (position > -1)
            config.site_exclusions.splice(position, 1);
        refreshConfigProperty('site_exclusions', config.site_exclusions);

        action.sendMixpanelEvent({
            identifier:config.identifier,
            event:'Allow',
            data: {
                is_turn: 'true',
                url: request.value
            }
        });

        return true;
    },
    addWordExclusion: function(request) {
        refreshLocalConfig();
        if (!config.word_exclusions)
            config.word_exclusions = {};

        let locale = request.value.locale;

        if (!config.word_exclusions[locale])
            config.word_exclusions[locale] = [];

        if (config.word_exclusions[locale].indexOf(request.value.word) < 0)
            config.word_exclusions[locale].push(request.value.word);
        refreshConfigProperty('word_exclusions', config.word_exclusions);
        return true;
    },
    sendMixpanelEvent: function(request) {
        if (typeof mixpanel == 'undefined') {
            (function(c,a){if(!a.__SV){var b=window;try{var d,m,j,k=b.location,f=k.hash;d=function(a,b){return(m=a.match(RegExp(b+"=([^&]*)")))?m[1]:null};f&&d(f,"state")&&(j=JSON.parse(decodeURIComponent(d(f,"state"))),"mpeditor"===j.action&&(b.sessionStorage.setItem("_mpcehash",f),history.replaceState(j.desiredHash||"",c.title,k.pathname+k.search)))}catch(n){}var l,h;window.mixpanel=a;a._i=[];a.init=function(b,d,g){function c(b,i){var a=i.split(".");2==a.length&&(b=b[a[0]],i=a[1]);b[i]=function(){b.push([i].concat(Array.prototype.slice.call(arguments,
                0)))}}var e=a;"undefined"!==typeof g?e=a[g]=[]:g="mixpanel";e.people=e.people||[];e.toString=function(b){var a="mixpanel";"mixpanel"!==g&&(a+="."+g);b||(a+=" (stub)");return a};e.people.toString=function(){return e.toString(1)+".people (stub)"};l="disable time_event track track_pageview track_links track_forms track_with_groups add_group set_group remove_group register register_once alias unregister identify name_tag set_config reset opt_in_tracking opt_out_tracking has_opted_in_tracking has_opted_out_tracking clear_opt_in_out_tracking start_batch_senders people.set people.set_once people.unset people.increment people.append people.union people.track_charge people.clear_charges people.delete_user people.remove".split(" ");
                for(h=0;h<l.length;h++)c(e,l[h]);var f="set set_once union unset remove delete".split(" ");e.get_group=function(){function a(c){b[c]=function(){call2_args=arguments;call2=[c].concat(Array.prototype.slice.call(call2_args,0));e.push([d,call2])}}for(var b={},d=["get_group"].concat(Array.prototype.slice.call(arguments,0)),c=0;c<f.length;c++)a(f[c]);return b};a._i.push([b,d,g])};a.__SV=1.2;b=c.createElement("script");b.type="text/javascript";b.async=!0;b.src="undefined"!==typeof MIXPANEL_CUSTOM_LIB_URL?
                MIXPANEL_CUSTOM_LIB_URL:chrome.extension.getURL('js/mixpanel-2-latest.min.js');d=c.getElementsByTagName("script")[0];d.parentNode.insertBefore(b,d)}})(document,window.mixpanel||[]);
            mixpanel.init("0c08de169505a6691de1aa0952eeeaa0", {batch_requests: true});
            mixpanel.identify(request.identifier);
        }

        if (request.event)
        {
            let local_data = {};
            if (request.data)
                local_data = request.data;
            if (request.email)
                local_data.email = request.email;
            local_data.test_version = 3;
            mixpanel.track(request.event, local_data);
        }

        if (request.people)
            mixpanel.people.set(request.people);

        if (request.peopleUnset)
            mixpanel.people.unset(request.peopleUnset);
    },
    sendFacebookPixel: function(request) {
        console.log('before facebook');
        console.log(window);
        console.log(document);
        !function(f,b,e,v,n,t,s)
        {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window,document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
        console.log(fbq('init', '243510654061849'));
        console.log(fbq('track', request.event/*'install'*/));
        console.log('after facebook');
    },
    run: function (request) {
        return (request.action && typeof this[request.action] == 'function') ? this[request.action](request) : false;
    }
};

function getIdentifier() {
    console.log('back getIdentifier: '+config.identifier);
    if (!config.identifier)
        refreshLocalConfig();
    if (!config.identifier)
        config.identifier = Date.now()+'_'+(Math.random()+'').replace('.','');
    refreshConfigProperty('identifier', config.identifier);
}

function refreshLocalConfig() {
    let local_storage_config = localStorage.getItem('config');

    local_storage_config = JSON.parse(local_storage_config);
    if (local_storage_config)
        config = local_storage_config;
}

function refreshConfigProperty(key, value) {
    let local_storage_config = localStorage.getItem('config');
    local_storage_config = JSON.parse(local_storage_config);
    if (local_storage_config) {
        if (local_storage_config[key]) {
            config[key] = local_storage_config[key];
        }
    }
    config[key] = value;
    localStorage.setItem('config', JSON.stringify(config));

    chrome.tabs.query({ active : true, currentWindow: true}, function (tabs) {
        $(tabs).each(function () {
            /*console.log('refreshConfig');
            console.log(config);*/
            chrome.tabs.sendMessage(this.id, {action: "refreshConfig", value: config})
        });
    });
}

function setIsPaused(local_config) {
    if (!local_config.pause_data || !local_config.pause_data.duration)
        config.isPaused = false;
    else {
        if (local_config.pause_data.duration < 0)
            config.isPaused = true;
        else {
            config.isPaused = (local_config.pause_data.until >= Date.now());
        }
    }
}

function setIsEnabled(local_config) {
    setIsPaused(local_config);

    let is_exlusion = false;
    if (local_config.site_exclusions.length && local_config.site_exclusions.indexOf(local_config.host) > -1)
        is_exlusion = true;

    if (is_exlusion || config.isPaused) {
        config.isEnabled = false;
        chrome.browserAction.setIcon({path:'image/logo_16_disable.png'});
    }
    else {
        config.isEnabled = true;
        chrome.browserAction.setIcon({path:'image/logo_16.png'});
    }
}

function refreshLoginTabs()
{
    chrome.tabs.query({ active: true }, (tabs) => {
        $(tabs).each(function () {
            if ((/dokiwi.com\/login/.test(this.url) || /dokiwi.com\/settings-anonymous/.test(this.url)) && config.token)
            {
                chrome.tabs.sendMessage(this.id, {action: "refresh"});
            }
        });
    });
}

chrome.extension.onMessage.addListener(function(request, sender, sendResponse) {
    if(request.closeThis)
    {
        chrome.tabs.remove(sender.tab.id);
        refreshLoginTabs();
    }
    else
        sendResponse(action.run(request));
});

chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason == 'install') {
        console.log('onInstalled localStorage config before clear: '+localStorage.getItem('config'));
        localStorage.clear();

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            $(tabs).each(function () {
                let local_url_path = /:\/\/[^\/]+(.*)/.exec(this.url)[1];
                if (/\/webstore\/detail\/kiwi\//.test(local_url_path))
                {
                    let local_url_params = local_url_path.split('?');
                    if (local_url_params.length > 1)
                    {
                        let local_search_params = {};
                        local_url_params[1].split('&').forEach(function(elem){
                            let [param, val] = elem.split('=');
                            local_search_params[param] = val;
                        });

                        if (local_search_params.mixpanel_id){
                            refreshConfigProperty('identifier', local_search_params.mixpanel_id);
                        }
                    }
                }

                getIdentifier();

                let local_time = new Date();

                console.log('onInstalled identifier: '+config.identifier);
                console.log('onInstalled localStorage config: '+localStorage.getItem('config'));

                action.sendMixpanelEvent({
                    identifier:config.identifier,
                    email:false,
                    event:'install event',
                    data: {
                        'install_page_url': this.url
                    },
                    people: {
                        'idate': local_time.getFullYear() + '-' + (local_time.getMonth() + 1 + '').padStart(2,'0') + '-' + local_time.getDate() + ' ' + local_time.getHours() + ':' + local_time.getMinutes(),
                        'status': 'trial',
                        'type': config.level_names[2],
                        'is_turn': 'true'
                    }
                });

                action.sendFacebookPixel({
                    event:'install'
                });
            });
        });
    }
});
