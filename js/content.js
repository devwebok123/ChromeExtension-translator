chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action == 'refreshConfig'){
        words_parser.config = request.value;
        console.log('content.js-refreshConfig');
        console.log(words_parser.config);
        if (words_parser.config.token) {
            $.ajax({
                url: words_parser.config.backend+'api/config',
                data: {
                    config: JSON.stringify(words_parser.config)
                },
                headers: words_parser.config.token ? {Authorization: 'Bearer '+words_parser.config.token} : {},
                method: 'POST'
            }).done(function (response) {
                console.log('api/config');
                console.log(response);
            });
        }
    }
    else if (request.action == 'refresh')
        window.location.reload()
});

function getDocuemntLang() {
    let html_lang = jQuery('html').attr('lang');
    if (html_lang == 'ru-RU')
        html_lang = 'ru';
    return html_lang;
}

function setTokenAndClose(response) {
    chrome.runtime.sendMessage({
        action:'setToken',
        value:response.token,
        user_email:response.user.email
    });
    chrome.runtime.sendMessage({closeThis: true});
}

window.onload = function () {
    if (window.location.pathname == '/api/google-auth' && window.location.search) {
        let response = JSON.parse(window.document.body.innerText);
        if (response.token) {
            if (response.config) {
                config = JSON.parse(response.config);
                chrome.runtime.sendMessage({
                    action:'setConfig',
                    value:config
                });
            }
            if (response.google_registration) {
                chrome.runtime.sendMessage({action: "getConfig"}, function(getConfigResponse) {
                    /*chrome.runtime.sendMessage({
                        action:'sendMixpanelEvent',
                        identifier:getConfigResponse.identifier,
                        email:response.user.email,
                        event:'signup event'
                    });*/
                    chrome.runtime.sendMessage({
                        action:'sendFacebookPixel',
                        event:'signup'
                    });
                    setTokenAndClose(response);
                });
            }
            else {
                setTokenAndClose(response);
            }
        }
    }
};

let words_parser_prefix = 'words_parser_';

let words_parser_translations = {};//TODO: move to background script

let words_parser = {
    logo: chrome.extension.getURL("image/logo_64.png"),
    localizations: ['ru','pt'],
    words: [],
    unique_words: {},
    repeated_words: [],
    replacer: words_parser_prefix+(Math.random()+'').replace('.',''),
    translated_replacer: words_parser_prefix+'translated',
    translated_style: "padding: 2px;border-radius: 2px;cursor:pointer;pointer-events: auto;z-index: 5;",
    max_unique: 0,
    max_repeated: 0,
    fact_unique: 0,
    fact_repeated: 0,
    exclusions: 'a,img,iframe,input.select,textarea,button,code',
    is_busy: false,
    config: false,
    visible_words: [],
    translated_words: [],
    mode: 1,
    parts_of_speech: {
        'ru' : {
            'ADJ':'прилагательное',
            'ADP':'предлог и послелог',
            'ADV':'Наречие',
            'CONJ':'союз',
            'DET':'Детерминант',
            'NOUN':'Существительное',
            'NUM':'числительное',
            'PRON':'Местоимение',
            'PRT':'Частица или другое функциональное слово',
            'PUNCT':'Пунктуация',
            'VERB':'Глагол',
            'X':'Другое: иностранные слова, опечатки, сокращения.',
            'AFFIX':'придаток'
        },
        'pt' : {
            'ADJ':'Adjetivo',
            'ADP':'Adposição',
            'ADV':'Advérbio',
            'CONJ':'Conjunção',
            'DET':'Determinante',
            'NOUN':'Substantivo',
            'NUM':'Número cardinal',
            'PRON':'Pronome',
            'PRT':'Partícula ou outra palavra de função',
            'PUNCT':'Pontuação',
            'VERB':'Verbo',
            'X':'Outros: palavras estrangeiras, erros de digitação, abreviações',
            'AFFIX':'Afixo'
        }
    },
    parseWords: function (element, receiver) {
        element.addClass(this.replacer);
        let str = element.html();
        let word = {
            value:'',
            is_tag:false,
            element: false,
            depth: 0,
            previous_symbol: '',
            is_closing_tag: false,
            is_tag_params: false,
            to_skip: false
        };
        let default_word = Object.assign({}, word);
        let local_words = {};
        for (n in str) {
            let l = str[n];
            if (typeof(l) == 'string')
            {
                if (!word.is_tag) {
                    if (/[a-zA-Zа-яА-ЯáéíóúàâêôãõüçÁÉÍÓÚÀÂÊÔÃÕÜÇ]/.test(l)) {
                        if (!word.depth)
                            if (n > 0 || word.depth > 0)
                                if (/[A-ZА-ЯÁÉÍÓÚÀÂÊÔÃÕÜÇ]/.test(l))
                                    word.to_skip = true;
                        if (!word.value.length) {
                            word.start = n;
                            word.element = element;
                        }
                        word.value += l;
                    }
                    else if (/[\s\.,\!\?\(\)'":;<]/.test(l)) {
                        if (word.value.length) {
                            if (this.pushWord(word, receiver, local_words)) return;
                        }
                        word = Object.assign({}, default_word);

                        if (l=='<') {
                            word.is_tag = true;
                            word.is_tag_params = true;
                            word.depth++;
                        }
                    }
                    else
                        word = Object.assign({}, default_word);
                }
                else {
                    if (l == '>' && (word.previous_symbol == '/' || word.is_closing_tag)) {
                        word.depth--;
                        word.is_closing_tag = false;
                        if (word.depth == 0)
                            word = Object.assign({}, default_word);
                    }
                    else if (l == '>') {
                        word.is_tag_params = false;
                    }
                    else if (l == '/' && word.previous_symbol == '<') {
                        word.is_closing_tag = true;
                    }
                    else if (l != '/' && word.previous_symbol == '<' && !word.is_tag_params) {
                        word.depth++;
                    }
                }

                if (word.is_tag)
                    word.previous_symbol = l;
            }
            else {
                if (this.pushWord(word, receiver, local_words)) return;
            }
        }
        if (word.value.length)
            if (this.pushWord(word, receiver, local_words)) return;
    },
    pushWord: function (word, receiver, local_words) {
        if (!words_parser.config.total_word_count)
            words_parser.config.total_word_count = 1;
        else
            words_parser.config.total_word_count++;

        if (!(word.value in words_parser.config.dictionary)) {
            return false;
        }

        word.value = word.value.toLowerCase();
        if (words_parser.config.dictionary[word.value] == undefined) {
            console.log('undefined: ' + word.value);
            return false;
        }
        word.freq = words_parser.config.dictionary[word.value]['lemfreq'];
        word.lemma = words_parser.config.dictionary[word.value]['lemma'];
        
        if (!word.to_skip && word.value.length >= 3) {

            let locale = getDocuemntLang();
            if (words_parser.config && words_parser.config.word_exclusions && words_parser.config.word_exclusions[locale] && words_parser.config.word_exclusions[locale].indexOf(word.value) > -1) {
                //console.log('Exclusion found: '+word.value);
                return false;
            }

            if (!local_words[word.value])
                local_words[word.value] = 1;
            else
                local_words[word.value]++;

            word.local_index = local_words[word.value];

            if (receiver.word_to_replace) {
                if (receiver.word_to_replace.value == word.value && receiver.word_to_replace.local_index == word.local_index) {
                    receiver.word_to_replace.start = word.start;
                    return true;
                }
            } else {
                if (words_parser.mode > 1 && words_parser.visible_words.length > 50)
                    words_parser.visible_words.splice(-1);
                receiver.unshift(word);
            }
        }
        return false;
    },
    allElements: function (s){
        var currentEls = $(s);
        var result = [];
        currentEls.each(function(){
            var el = $(this);
            result.push(this);
        });
        return $(result);
    },
    inWindow: function (s){
        var scrollTop = $(window).scrollTop();
        var windowHeight = $(window).height();
        var currentEls = $(s);
        var result = [];
        var mode_2_const = 500;
        currentEls.each(function(){
            var el = $(this);
            var offset = el.offset();
            if(words_parser.mode < 2 && scrollTop <= offset.top && (el.height() + offset.top) < (scrollTop + windowHeight))
                result.push(this);
            else if (scrollTop + mode_2_const <= offset.top && (el.height() + offset.top) < (scrollTop + mode_2_const + windowHeight))
                result.push(this);
        });
        return $(result);
    },
    run: function () {
        if (this.isBlocked()) {
            return;
        }

        this.is_busy = true;
        this.allElements('body :not('+words_parser.exclusions+'):visible:not(.'+words_parser.replacer+')').each(function () {
                if (!$(this).parents(words_parser.exclusions).length) {
                words_parser.parseWords($(this), words_parser.words);
                console.log('total words parsed: ' + words_parser.words.length);
            }
        });

        words_parser.words.forEach( function(item, index) {
            item.counter = 0;
            words_parser.words.forEach( function(item2, index2) {
                if (item2.value == item.value) {
                    item.counter++;
                }
            });
        });

        sorted_words = words_parser.words.sort(function (a, b) {
            if (a.value in words_parser_translations && b.value in words_parser_translations == false)
                return -1;
            else if (b.value in words_parser_translations && a.value in words_parser_translations == false)
                return 1;
            return (a.counter < b.counter ) ? 1 : (a.counter == b.counter ? ((a.freq < b.freq) ? 1 : -1) : -1);
        });

        this.dbTranslate(sorted_words);
        this.is_busy = false;
    },
    dbTranslate: function (sorted_words) {

        let LIMIT_COUNT = 5;
        let limited = {};
        let translated = 0;

        let locale = getDocuemntLang();

        let num_words_to_replace = Math.floor(words_parser.config.total_word_count * words_parser.config.freq);
        for (i=0; i< sorted_words.length; i++) {
            if (num_words_to_replace == 0)
                break;
            if (words_parser.config.word_exclusions && words_parser.config.word_exclusions[locale] && words_parser.config.word_exclusions[locale].includes(sorted_words[i].lemma))
                continue;
            if (sorted_words[i].value in words_parser_translations == false) {
                words_parser_translations[sorted_words[i].value] = sorted_words[i].lemma;
            }
            if (sorted_words[i].lemma in limited) {
                limited[sorted_words[i].lemma]++;
            }
            else {
                limited[sorted_words[i].lemma] = 0;
            }
            if (limited[sorted_words[i].lemma] < LIMIT_COUNT) {
                words_parser.replaceWithTranslation(sorted_words[i]);
                console.log('REPLACE: ' + sorted_words[i].lemma);
                --num_words_to_replace;
                translated++;
            }
        }
        chrome.runtime.sendMessage({
            action:'addTranslationCount',
            value:translated
        });
    
    },
    translate: function () {
        this.is_busy = true;

        let num_words_to_replace = Math.floor(this.words.length / this.getWordsPerLevel());
        this.max_unique = Math.ceil(num_words_to_replace * 0.6);
        this.max_repeated = num_words_to_replace - this.max_unique;

        this.visible_words = [];
        this.repeated_words = [];

        //words_parser.inWindow('body .'+words_parser.replacer+':not(.'+words_parser.translated_replacer+'):not('+words_parser.exclusions+'):visible').each(function () {
        words_parser.allElements('body .'+words_parser.replacer+':not(.'+words_parser.translated_replacer+'):not('+words_parser.exclusions+'):visible').each(function () {
            if (!$(this).parents(words_parser.exclusions).length) {
                words_parser.parseWords($(this), words_parser.visible_words);
            }
        });

        if (this.visible_words.length) {
            if (this.max_unique - this.fact_unique > 0) {

                let random_word_index = Math.floor(Math.random()*this.visible_words.length);
                if (this.translated_words.indexOf(this.visible_words[random_word_index].value) < 0)
                    this.getTranslation(this.visible_words[random_word_index].value);
                else
                    this.is_busy = false;
            }
            else if (this.max_repeated - this.fact_repeated > 0) {
                $(this.translated_words).each(function () {
                    let word = this;
                    $(words_parser.visible_words).each(function () {
                        if (this.value == word)
                            words_parser.repeated_words.push(this);
                    });
                });

                if (words_parser.repeated_words.length) {
                    let random_word_index = Math.floor(Math.random()*words_parser.repeated_words.length);
                    this.getTranslation(words_parser.repeated_words[random_word_index].value);
                }
                else
                    this.is_busy = false;
            }
            else
                this.is_busy = false;
        }
        else
            this.is_busy = false;
    },
    isBlocked: function() {
        is_blocked = false;
        if (!words_parser.config.blacklist) {
            return false;
        }
        words_parser.config.blacklist.forEach( function(item, index) {
            if (document.location.host.includes(item.site)) {
                console.log('blocked site');
                is_blocked = true;
                return;
            }
        });
        return is_blocked;
    },
    getTranslation: function (word) {
        //TODO: send request only if not found in background script
        console.log('Words per level: '+this.getWordsPerLevel());
        console.log('is_active_time: '+this.config.is_active_time);
        if (!this.config.is_active_time || this.config.is_active_time+3600*24*1000 < Date.now()) {
            chrome.runtime.sendMessage({
                action:'sendMixpanelEvent',
                identifier:this.config.identifier,
                email:this.config.user_email,
                event:'active user'
            });
            this.config.is_active_time = Date.now();

            chrome.runtime.sendMessage({
                action:'setConfig',
                value:this.config
            });
        }
        if (!words_parser_translations[word]) {
            $.ajax({
                url: this.config.backend+'api/user',
                data: {
                    word: word,
                    lang_from: getDocuemntLang()
                },
                headers: this.config.token ? {Authorization: 'Bearer '+this.config.token} : {}
            }).done(function (response) {
                response = JSON.parse(response);
                if (response.success && response.translation != word) {
                    console.log('from backend: '+word);
                    words_parser_translations[word] = response;

                    words_parser.replaceInVisible(word, response);

                    if (response.config)
                        words_parser.config = JSON.parse(response.config);
                }
                else {
                    setTimeout(function () {
                        words_parser.is_busy = false;
                    },1000);
                    return;
                }

                words_parser.is_busy = false;
            });
        }
        else {
            console.log('from local: '+word);
            words_parser.replaceInVisible(word, words_parser_translations[word]);
            words_parser.is_busy = false;
        }
    },
    replaceInVisible: function (word, translation) {
        let translated = false;
        console.log('visible_words length: '+words_parser.visible_words.length);
        $(words_parser.visible_words).each(function () {
            if (!translated && this.value == word) {
                words_parser.replaceByTranslation(this, translation);
                translated = true;
                if (words_parser.translated_words.indexOf(word) < 0) {
                    words_parser.fact_unique++;
                    words_parser.translated_words.push(word);
                }
                else {
                    words_parser.fact_repeated++;
                }
                console.log('exclusions: ');
                console.log(words_parser.config.word_exclusions);
                console.log('unique = '+words_parser.max_unique+':'+words_parser.fact_unique+'; repeated: '+words_parser.max_repeated+':'+words_parser.fact_repeated);
            }
        });
    },
    replaceWithTranslation: function (original) {
        let receiver = {
            word_to_replace: {
                value: original.value,
                local_index: original.local_index
            }
        };
        this.parseWords(original.element, receiver);

        if (typeof receiver.word_to_replace.start == 'undefined')
            return false;

        let replacement_text = '<span hide="hide" original="'+original.value+'" class="'+words_parser.replacer+' '+words_parser.translated_replacer+' word-blue" style="'+words_parser.translated_style+'">' + original.lemma + '</span>';

        let replacement_block = original.element.html().substr(0,receiver.word_to_replace.start) +
            replacement_text +
            original.element.html().substr(parseInt(receiver.word_to_replace.start) + parseInt(original.value.length));

        original.element.html(replacement_block);

        $('.'+words_parser.translated_replacer+'[original]:not([custom_popup_id])').each(function () {

            $(this).attr('custom_popup_id',Date.now());
            let local_custom_popup_id = $(this).attr('custom_popup_id');
            let cloned = $(tooltip_html).clone();
            $(cloned).attr('id',$(this).attr('custom_popup_id'));
            let original_word = $(this).attr('original');

            $(cloned).find('.words_parser_data_1').html(original_word);

            let html_lang = getDocuemntLang();
            $(cloned).find('.words_parser_tooltip_add_exclusion').on('click',function (){
                console.log('addWordExclusion');
                console.log(original_word);

                $('[original="'+original_word+'"]').each(function () {
                    $('#'+$(this).attr('custom_popup_id')).remove();
                    $(this).removeClass(words_parser.translated_replacer);
                    if ($(this).html() != original_word)
                        $(this).css('background-image',"url('"+chrome.extension.getURL('image/confetti.gif')+"')").css({opacity:0}).html(original_word).animate({opacity:1},3000,function () {
                            $(this).attr('style','');
                        });
                });

                exclusion = {locale: html_lang, word: original.lemma};

                chrome.runtime.sendMessage({action: "addWordExclusion",value:exclusion});
            }).attr('alt',chrome.i18n.getMessage("IKnowThis"));

            $(cloned).find('.words_parser_tooltip_add_settings').attr('alt','Settings').on('click',function () {
                window.open(chrome.extension.getURL("popup.html"),'popup','width=380,height=700');
                return false;
            });//TODO: optimize

            console.log(receiver.word_to_replace);

            
$(cloned).find('.words_parser_tooltip_speak').attr('audio',original.lemma).on('click', function() {
    word_to_play = this.attributes['audio'].value;
    var audio = new Audio('https://api.dokiwi.com/api/audio?word='+word_to_play);
    audio.play();
});

            $('body').append(cloned);

            $('.words_parser_tooltip').off('mouseenter').on('mouseenter',function () {
                console.log('mouseenter');
                $('[original="'+$(this).find('.words_parser_data_1').html()+'"]').attr('hide',null);
            });
        });
        $('[custom_popup_id]').each(function () {
            $(this).off('mouseleave').off('mouseenter').on('mouseenter',function () {
                console.log('T-mouseenter');

                $(this).attr('hide','hide');
                $('.words_parser_tooltip').hide();
                let t = this;
                setTimeout(function () {
                    $('#'+$(t).attr('custom_popup_id')).fadeIn('fast');

                    if ($(t).offset().left + $('#'+$(t).attr('custom_popup_id')).width() > window.outerWidth) {
                        $('#'+$(t).attr('custom_popup_id')).css({
                            right: 0
                        });
                    }
                    else {
                        let local_left = $(t).offset().left;
                        $('#'+$(t).attr('custom_popup_id')).offset({
                            left: local_left
                        });
                    }

                    let local_top = $(t).offset().top + $(t).height();
                    $('#'+$(t).attr('custom_popup_id')).offset({
                        top: local_top
                    });

                }, 300);

            }).on('mouseleave',function () {
                console.log('mouseleave');
                let t = this;
                setTimeout(function () {
                    if ($(t).attr('hide')) {
                        $('#'+$(t).attr('custom_popup_id')).fadeOut('fast');
                    }
                },100);
            });
        });
        $('.words_parser_tooltip').off('mouseleave').on('mouseleave',function () {
            let t = this;
            setTimeout(function () {
                if (!$('[custom_popup_id='+$(t).attr('id')+']').attr('hide')) {
                    console.log('fade out 2');
                    $(t).fadeOut('fast');
                }
            }, 100);
        });
        $('.word-blue').animate({'background-color':'rgba(207, 236, 245, 0.5)',color:'black'});
        return true;
    },
    replaceByTranslation: function (original, translation) {
        let receiver = {
            word_to_replace: {
                value: original.value,
                local_index: original.local_index
            }
        };
        this.parseWords(original.element, receiver);

        if (typeof receiver.word_to_replace.start == 'undefined')
            return false;

        if (translation.meaning)
            translation.meaning = translation.meaning.replace(/(.)/,translation.meaning[0].toLowerCase());
        let replacement_text = '<span hide="hide" original="'+original.value+'" meaning="'+(translation.meaning?translation.meaning:'')+'" part_of_speech="'+translation.part_of_speech+'" class="'+words_parser.replacer+' '+words_parser.translated_replacer+' word-blue" style="'+words_parser.translated_style+'">' + translation.translation + '</span>';

        let replacement_block = original.element.html().substr(0,receiver.word_to_replace.start) +
            replacement_text +
            original.element.html().substr(parseInt(receiver.word_to_replace.start) + parseInt(original.value.length));

        original.element.html(replacement_block);

        $('.'+words_parser.translated_replacer+'[original]:not([custom_popup_id])').each(function () {

            $(this).attr('custom_popup_id',Date.now());
            let local_custom_popup_id = $(this).attr('custom_popup_id');
            let cloned = $(tooltip_html).clone();
            $(cloned).attr('id',$(this).attr('custom_popup_id'));
            let original_word = $(this).attr('original');

            $(cloned).find('.words_parser_data_1').html(original_word);

            $(cloned).find('.words_parser_tooltip_add_exclusion').on('click',function (){
                console.log('addWordExclusion');
                console.log(original_word);

                $('[original="'+original_word+'"]').each(function () {
                    $('#'+$(this).attr('custom_popup_id')).remove();
                    $(this).removeClass(words_parser.translated_replacer);
                    if ($(this).html() != original_word)
                        $(this).css('background-image',"url('"+chrome.extension.getURL('image/confetti.gif')+"')").css({opacity:0}).html(original_word).animate({opacity:1},3000,function () {
                            $(this).attr('style','');
                        });
                });

                chrome.runtime.sendMessage({action: "addWordExclusion",value:original_word});
            }).attr('alt',chrome.i18n.getMessage("IKnowThis"));

            $(cloned).find('.words_parser_tooltip_add_settings').attr('alt','Settings').on('click',function () {
                window.open(chrome.extension.getURL("popup.html"),'popup','width=380,height=700');
                return false;
            });//TODO: optimize

            $('body').append(cloned);

            $('.words_parser_tooltip').off('mouseenter').on('mouseenter',function () {
                console.log('mouseenter');
                $('[original="'+$(this).find('.words_parser_data_1').html()+'"]').attr('hide',null);
            });
        });
        $('[custom_popup_id]').each(function () {
            $(this).off('mouseleave').off('mouseenter').on('mouseenter',function () {
                console.log('T-mouseenter');

                $(this).attr('hide','hide');
                $('.words_parser_tooltip').hide();
                let t = this;
                setTimeout(function () {
                    $('#'+$(t).attr('custom_popup_id')).fadeIn('fast');

                    if ($(t).offset().left + $('#'+$(t).attr('custom_popup_id')).width() > window.outerWidth) {
                        $('#'+$(t).attr('custom_popup_id')).css({
                            right: 0
                        });
                    }
                    else {
                        let local_left = $(t).offset().left;
                        $('#'+$(t).attr('custom_popup_id')).offset({
                            left: local_left
                        });
                    }

                    let local_top = $(t).offset().top + $(t).height();
                    $('#'+$(t).attr('custom_popup_id')).offset({
                        top: local_top
                    });

                }, 300);

            }).on('mouseleave',function () {
                console.log('mouseleave');
                let t = this;
                setTimeout(function () {
                    if ($(t).attr('hide')) {
                        $('#'+$(t).attr('custom_popup_id')).fadeOut('fast');
                    }
                },100);
            });
        });
        $('.words_parser_tooltip').off('mouseleave').on('mouseleave',function () {
            let t = this;
            setTimeout(function () {
                if (!$('[custom_popup_id='+$(t).attr('id')+']').attr('hide')) {
                    console.log('fade out 2');
                    $(t).fadeOut('fast');
                }
            }, 100);
        });
        $('.word-blue').animate({'background-color':'rgba(207, 236, 245, 0.5)',color:'black'});
        return true;
    },
    getWordsPerLevel: function () {
        return parseInt(this.config.levels[parseInt(this.config.level)]);
    }
};

$(function() {
    if (/dokiwi.com/.test(document.location.host)) {
    //if (/laravel-chrome-extension.com/.test(document.location.host)) {

        chrome.runtime.sendMessage({action: "getConfig"}, function(response) {
            words_parser.config = response;
            if (document.location.pathname == '/login' || document.location.pathname == '/settings-anonymous') {
                if (words_parser.config.token)
                {
                    $.ajax({
                        url: document.location.origin+'/login-by-token',
                        headers: {Authorization: 'Bearer '+words_parser.config.token},
                        success:function(response){if (!!response) document.location.reload()}
                    })
                }
            }
            else if (!words_parser.config.token) {
                $.ajax({
                    url: document.location.origin+'/check-authorization',
                    success:function(response){
                        console.log('check-authorization');
                        console.log(response);
                        if (response.token)
                        {
                            chrome.runtime.sendMessage({
                                action:'setToken',
                                value:response.token,
                                user_email:response.user.email
                            });
                        }
                    }
                })
            }
        });

        $('#logout_button').on('click',function () {
            chrome.runtime.sendMessage({
                action:'setToken',
                value:false,
                user_email:false
            });
        });
    }
    else
    {
        let html_lang = getDocuemntLang();
        let readyTimer = setInterval(function() {
            if (words_parser.localizations.indexOf(html_lang) > -1) {
                if (true/*chrome.i18n.getMessage("locale") == html_lang*/) {
                    chrome.runtime.sendMessage({action: "getConfigDictionary", host: window.location.host, locale: html_lang}, function(response) {
                        if (response === false) {
                            return;
                        }
                        
                        clearInterval(readyTimer);
                        words_parser.config = response.config;
                        words_parser.config.dictionary = response.dictionary;
    
                        console.log('freq = ' + words_parser.config.freq);
    
                        if (words_parser.config.isEnabled) {
                            if (words_parser.getWordsPerLevel()) {
                                words_parser.run();
                            }
                        }
                    });
                }
                else {
                    console.log('Extension locale not equal to site language');
                }
            }
            else {
                console.log('Wrong language');
            }
        }, 1000);

        chrome.runtime.sendMessage({action: "getConfigDictionary", host: window.location.host, locale: html_lang}, function(response) {});

        /*
        let html_lang = getDocuemntLang();
        if (words_parser.localizations.indexOf(html_lang) > -1) {
            if (chrome.i18n.getMessage("locale") == html_lang) {
                chrome.runtime.sendMessage({action: "getConfigDictionary", host: window.location.host}, function(response) {
                    words_parser.config = response.config;
                    words_parser.config.dictionary = response.dictionary;

                    console.log('freq = ' + words_parser.config.freq);

                    if (words_parser.config.isEnabled) {
                        if (words_parser.getWordsPerLevel()) {
                            words_parser.run();
                            $( window ).scroll(function() {
                                words_parser.mode = 2;
                                words_parser.run();
                            });

                            setInterval(function () {
                                if (!words_parser.is_busy) {
                                    words_parser.translate();
                                }

                                let visible_popup = $('.words_parser_tooltip:visible:first');
                                if (visible_popup.length) {
                                    let parent_element = $('[aria-describedby='+visible_popup.attr('id')+']');
                                    if (parent_element.length) {
                                        let local_top = parent_element.offset().top + parent_element.height() - visible_popup.offset().top;
                                        let local_left = parent_element.offset().left - visible_popup.offset().left;
                                        visible_popup.offset({
                                            top: local_top,
                                            left: local_left
                                        });
                                    }
                                }
                            }, 100);
                        }
                    }
                });
            }
            else {
                console.log('Extension locale not equal to site language');
            }
        }
        else
            console.log('Wrong language');
        */
    }
});

tooltip_html =  '<div class="words_parser_tooltip '+words_parser.translated_replacer+' '+words_parser.replacer+'">' +
                  '<div class="words_parser_tooltip_inner">' +
                    '<div class="words_parser_tooltip_btns_div">' +
                      '<!-- <div class="words_parser_tooltip_add_settings"></div> -->' +
                      '<div class="words_parser_tooltip_add_exclusion"></div>' +
                    '</div>' +
                    '<img src="https://cdn3.iconfinder.com/data/icons/watchify-v1-0-32px/32/speaker-volume-512.png" class="words_parser_tooltip_speak">' +
                    '<p class="words_parser_data_1"></p>' +
                  '</div>' +
                '</div>';
