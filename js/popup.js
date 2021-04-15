let config= {};
let popup_domain;

chrome.runtime.sendMessage({data:"Handshake"},function(response){

});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
    if (request.action == 'refreshConfig') {
        console.log('refreshConfig');
        config = request.value;
        isAuthorized();
        updateCount();
    }
});

function isAuthorized()
{
    if (config.token) {
        $('.block-to-hide').hide();
        $('#settings').show();
        $('#wordsets').show();
        $('#accessSettings').hide();
        //$('#allowAccess').show();

        if (config.level == 0) {
            chrome.runtime.sendMessage({
                action: 'changeLevel',
                value: 1
            });
        }

        console.log('isAuthorized');
        console.log(config);

        setLevelFromConfig();

        isOn();
    }
}

function refreshContent() {
    chrome.tabs.query({ active : true, currentWindow: true}, function (tabs) {
        $(tabs).each(function () {
            chrome.tabs.sendMessage(this.id, {action: "refresh"});
        });
    });
}

function changeToggleState(id) {
    if ($('#'+id+':checked').length) {
        $('[for='+id+']').removeClass('toggle_off').addClass('toggle_on');
    }
    else {
        $('[for='+id+']').removeClass('toggle_on').addClass('toggle_off');
    }
}

function setLevelFromConfig() {
    $('#settings label').removeClass('active');
    $('[name=level][value='+parseInt(config.level)+']').prop('checked',true).parent().addClass('active');
}

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

function updateCount() {
    console.log('today is ' + getToday());
    console.log(config.translated_today);
    if (!config.translated_today[config.user_email])
        config.translated_today[config.user_email] = {today: getToday(), count: 0};
    console.log('updateCount');
    if (getToday() != config.translated_today[config.user_email].today) {
        console.log('date changed');
        config.translated_today[config.user_email].today = getToday();
        config.translated_today[config.user_email].count = 0;
        chrome.runtime.sendMessage({
            action: 'addTranslationCount',
            value: 0
        });

    }
    console.log(config);
    label_words = chrome.i18n.getMessage("words");
    switch(config.level) {
        case 0:
        case 1:
            translationProgress.value = config.translated_today[config.user_email].count / 10;
            $('#goal-value').text(config.translated_today[config.user_email].count + '/' + '1000 ' + label_words);
            break;
        case 2:
            translationProgress.value = config.translated_today[config.user_email].count / 15;
            $('#goal-value').text(config.translated_today[config.user_email].count + '/' + '1500 ' + label_words);
            break;
        case 3:
            translationProgress.value = config.translated_today[config.user_email].count / 20;
            $('#goal-value').text(config.translated_today[config.user_email].count + '/' + '2000 ' + label_words);
            break;
        }
}

function changeLevelState(t) {
    t.find('input:first').prop('checked',true);
    $('#settings label').removeClass('active');
    t.addClass('active');

    updateCount();
}

function changeWordSet(wordset) {
    console.log('wordset - ' + wordset);
    console.log('wordset/2 - ' + wordset/2);
    value = 1;
    do {
        if (wordset % 2 == 1) {
            console.log('check - ' + value);
            $('[name=wordset][value=' + value + ']').prop('checked',true);
        }
        else {
            $('[name=wordset][value=' + value + ']').prop('checked',false);
        }
        value *= 2;
        console.log(wordset);
        wordset = wordset >> 1;
    } while (wordset > 0);
}

function setPauseDuration() {
    let local_duration = parseInt($('.select-duration-list').val());
    config.pause_data = {
        duration: local_duration,
        until: (local_duration > 0)?(parseInt(Date.now())+local_duration*60000):0
    };
}

function isOn() {
    let local_text = chrome.i18n.getMessage("appName")+' ';

    if (config.isPaused) {
        local_text += chrome.i18n.getMessage("isOff");
        if (config.pause_data.until > 0)
            local_text += ' ' + config.pause_data.duration + ' ' + chrome.i18n.getMessage("minutes");
        $('.preExtensionIsOn').hide();
        $('#sleepKiwi').fadeIn(500);
        $('.select-duration-list').val(config.pause_data.duration);
        $('.editDuration').html(chrome.i18n.getMessage("editDuration")).show();
        $('.select-duration-text').html(chrome.i18n.getMessage("selectDuration"));
        $('.select-duration-list option').each(function () {
            let local_value = parseInt($(this).val());
            if (local_value > 0)
                $(this).html(local_value+' '+chrome.i18n.getMessage("minutes"));
            else
                $(this).html(chrome.i18n.getMessage("forever"));
        });
        $('#extensionIsOn').prop('checked',false);
        $('.extension-is-on-small-text').hide();
    }
    else {
        $('#sleepKiwi').fadeOut(500, function() {
          $('#extensionIsOn').prop('checked',true);
          local_text += chrome.i18n.getMessage("isOn");
          $('.preExtensionIsOn').show();
          $('.editDuration').hide();
          $('.selectDuration').hide();
          $('.extension-is-on-small-text').show();
        });
    }
    $('.extension-is-on-text').html(local_text);
    $('.extension-is-on-small-text').html(chrome.i18n.getMessage("needTurnOff"));
    changeToggleState('extensionIsOn');
}

function loadDictionary() {
    console.log("loadDictionary");
    let locale = chrome.i18n.getMessage("locale");
    $.ajax({
        url: config.backend+'api/dict?level='+config.wordset+'&lang_from='+locale,
        headers: config.token ? {Authorization: 'Bearer '+config.token} : {},
        method: 'GET'
    }).done(function (response) {
        console.log('api/dict');
        dictionary = $.parseJSON(response).dictionary;
        chrome.runtime.sendMessage({
            action: 'setDictionary',
            value: dictionary
        });
    });
}

$(function() {
    chrome.runtime.sendMessage({action: "getConfig"}, function(response) {
        config = response;
        console.log('popup config: '+config.identifier);
        isAuthorized();

        $('#dashboard_link').parent('a').attr('href','https://app.dokiwi.com/settings-anonymous?identifier='+config.identifier);

        $('.editDuration').on('click',function () {
            $(this).hide();
            $('.selectDuration').show();
        });

        $('.confirm-duration-button').html(chrome.i18n.getMessage("confirm")).on('click',function () {
            setPauseDuration();
            $('.selectDuration').hide();
            $('.editDuration').show();
            chrome.runtime.sendMessage({
                action:'setConfig',
                isPausedChange:true,
                value:config
            }, function (response) {
                config = response;
                isOn();
            });
        });
        
        $('.toggle').on('click',function () {
            let local_id = $(this).attr('for');
            $('#'+local_id).click();
        });

        changeLevelState($('[name=level][value='+config.level+']').parent());

        changeWordSet(config.wordset);

        console.log(config.highlightEnabled);

        if (config.highlightEnabled == true) {
            $('#highlightEnabled').prop('checked', true);
            console.log('highlight is enabled');
        }
        else {
            $('#highlightEnabled').prop('checked', false);
            console.log('highlight is disabled');
        }

        changeToggleState('highlightEnabled');

        loadDictionary();
        
        $('#settings label').on('click',function () {
            console.log('change level');
            changeLevelState($(this));
            config.level = parseInt($('[name=level]:checked').val());
            if (config.token) {
                $.ajax({
                    url: config.backend+'api/config',
                    data: {
                        config: JSON.stringify(config)
                    },
                    headers: config.token ? {Authorization: 'Bearer '+config.token} : {},
                    method: 'POST'
                }).done(function (response) {
                    console.log('api/config');
                    console.log(response);
                    chrome.runtime.sendMessage({
                        action: 'changeFrequency',
                        value: $.parseJSON(response).freq
                    });
                });
            }
            chrome.runtime.sendMessage({
                action: 'changeLevel',
                value: config.level
            });
        });

        $('#wordsets label').on('click',function () {
            config.wordset = 0;
            console.log('change wordset');
            $('[name=wordset]:checked').each(function() {
                config.wordset += parseInt($(this).val());
            });

            if (config.token) {
                loadDictionary();
            }
            chrome.runtime.sendMessage({
                action: 'changeWordSet',
                value: config.wordset
            });
        });
        
        $('#extensionIsOn').on('change',function () {
            changeToggleState('extensionIsOn');

            let local_enabling = false;

            if ($(this).is(':checked')) {
                if (config.pause_data.duration < 0)
                    local_enabling = true;
                config.pause_data = {
                    duration: 0,
                    until: 0
                };
                config.isPaused = false;
            }
            else {
                setPauseDuration();
                config.isPaused = true;
            }

            chrome.runtime.sendMessage({
                action:'setConfig',
                value:config,
                isPausedChange:true,
                url:$('.site-enabled-domain').html(),
                enabling: local_enabling
            }, function (response) {
                config = response;
                isOn();
            });
        });
        
        $('#siteEnabled').on('change',function () {
            changeToggleState('siteEnabled');
            console.log('siteEnabled fired');

            let local_domain = $('.site-enabled-domain').html();

            if ($(this).is(':checked')) {
                console.log('removeExclusion fired');

                let position = config.site_exclusions.indexOf(local_domain);
                if (position > -1)
                    config.site_exclusions.splice(position, 1);

                chrome.runtime.sendMessage({
                    action: 'removeExclusion',
                    value: $('.site-enabled-domain').html()
                },function () {
                    refreshContent();
                });
            }
            else {
                console.log('addExclusion fired');

                if (config.site_exclusions.indexOf(local_domain) < 0)
                    config.site_exclusions.push(local_domain);

                chrome.runtime.sendMessage({
                    action: 'addExclusion',
                    value: $('.site-enabled-domain').html()
                },function () {
                    refreshContent();
                });
            }

            if (config.token) {
                $.ajax({
                    url: config.backend+'api/config',
                    data: {
                        config: JSON.stringify(config)
                    },
                    headers: config.token ? {Authorization: 'Bearer '+config.token} : {},
                    method: 'POST'
                }).done(function (response) {
                    console.log('api/config');
                    console.log(response);
                });
            }

        });

        $('#highlightEnabled').on('change',function () {
            changeToggleState('highlightEnabled');
            console.log('highlightEnabled fired');

            let local_domain = $('.site-enabled-domain').html();

            if ($(this).is(':checked')) {
                config.highlightEnabled = true;
            }
            else {
                config.highlightEnabled = false;
            }
            console.log(config);
            chrome.runtime.sendMessage({
                action:'setConfig',
                value:config
            }, function (response) {
                config = response;
            });
        });

        $('.closeBtn').on('click',function () {
            window.close();
        });

        $('.googleAuthButton').html('<img src="image/google-g.svg" style="width: 13.34px;margin-right: 16px;">' + chrome.i18n.getMessage("googleAuthButton")).on('click',function () {
            window.close();
            window.open($(this).attr('href')+'?mixpanel_id='+config.identifier+'&reg_from=extension','popup','width=600,height=600');
            return false;
        });

        $('#registerForm').on('submit',function () {
            let form = $(this);
            console.log(form.find('name[name]').val());
            $.post(//"Content-type", "application/x-www-form-urlencoded"
                config.backend+'api/register',
                {
                    name: form.find('[name=name]').val(),
                    email: form.find('[name=email]').val(),
                    password: form.find('[name=password]').val(),
                    identifier: config.identifier,
                    reg_from: 'extension'
                }
            ).always(function(response) {
                console.log('response');
                console.log(response);
                form.find('.error').html('');
                if (response.responseJSON && response.responseJSON.errors) {
                    form.find('input').each(function () {
                        $(this).next('.error').html(response.responseJSON.errors[$(this).attr('name')]);
                    });
                }
                else {
                    if (response.token)
                    {
                        chrome.runtime.sendMessage({
                            action:'setToken',
                            value:response.token,
                            user_email:response.user.email
                        });
                        $('.block-to-hide').hide();
                        $('#settings').show();
                        $('#wordsets').show();
                        isOn();
                        /*chrome.runtime.sendMessage({
                            action:'sendMixpanelEvent',
                            identifier:config.identifier,
                            email:response.user.email,
                            event:'signup event'
                        });*/
                        chrome.runtime.sendMessage({
                            action:'sendFacebookPixel',
                            event:'signup'
                        });
                    }
                    else {
                        form.find('.form-error').html(chrome.i18n.getMessage("undefinedError"));
                    }
                }
            });
            return false;
        });

        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            let local_domain = tabs[0].url.match(/\/\/([^\/]+)/)[1];
            $('.site-enabled-domain').html(local_domain);
            $('#siteEnabled').prop('checked',(!config.site_exclusions || config.site_exclusions.indexOf(local_domain) < 0));
            changeToggleState('siteEnabled');
            popup_domain = local_domain;
        });
    });

    $('.charMinDiv').html(chrome.i18n.getMessage("minimumPassword"));
    $('.registerButton').html(chrome.i18n.getMessage("registerButton"));
    $('.loginButtonText').html(chrome.i18n.getMessage("loginButtonText"));
    $('.loginButtonLink').html(chrome.i18n.getMessage("loginButtonLink"));
    $('.translationsNumber').html(chrome.i18n.getMessage("translationsNumber"));
    $('.forgotPassLink').html(chrome.i18n.getMessage("forgotPassLink")).on('click',function () {
        $('#loginForm').hide();
        $('#resetPasswordForm').show();
    });

    $('.saveProgress').html(chrome.i18n.getMessage("saveProgress"));
    $('.site-enabled-text').html(chrome.i18n.getMessage("allowedOn"));
    $('.site-enabled-small-text').html(chrome.i18n.getMessage("siteEnabledDescription"));

    $('.highlight-enabled-text').html(chrome.i18n.getMessage("highlightEnabled"));
    $('#wordsets-label').html(chrome.i18n.getMessage("wordSets"));
    $('#goal-label').html(chrome.i18n.getMessage("today_goal"));

    $('.back').html("<i style='font-size: 18px;font-weight: bold;margin-right: 1px;top: 1px;position: relative;' class='fa fa-angle-left'></i>  " + chrome.i18n.getMessage("back")).on('click',function () {
        $('.block-to-hide').hide();
        $('#start-block').show();
    });
    $('#showRegisterForm').on('click',function () {
        $('.block-to-hide').hide();
        $('#registerForm').show();
    });
    $('#showLoginForm').on('click',function () {
        $('.block-to-hide').hide();
        $('#loginForm').show();
    });

    $('#loginForm').on('submit',function () {
        let form = $(this);
        $.post(
            config.backend+'api/login',
            {
                email: form.find('[name=email]').val(),
                password: form.find('[name=password]').val()
            }
        ).always(function(response) {
            form.find('.error').html('');
            if (response.responseJSON && response.responseJSON.errors) {
                if (response.responseJSON.message)
                    form.find('.form-error').html(response.responseJSON.message);
                form.find('input').each(function () {
                    $(this).next('.error').html(response.responseJSON.errors[$(this).attr('name')]);
                });
            }
            else {
                if (response.token)
                {
                    if (response.config) {
                        config = JSON.parse(response.config);
                        chrome.runtime.sendMessage({
                            action:'setConfig',
                            value:config
                        });
                    }
                    chrome.runtime.sendMessage({
                        action:'setToken',
                        value:response.token,
                        user_email:response.user.email
                    });
                    $('.block-to-hide').hide();
                    setLevelFromConfig();
                    $('.site-enabled-domain').html(popup_domain);
                    $('#siteEnabled').prop('checked',(config.site_exclusions.indexOf(popup_domain) < 0));
                    changeToggleState('siteEnabled');
                    $('#settings').show();
                    $('#wordsets').show();
                    isOn();
                }
                else {
                    form.find('.form-error').html(chrome.i18n.getMessage("undefinedError"));
                }
            }
        });
        return false;
    });
    
    $('#resetPasswordForm').on('submit',function () {
        let form = $(this);
        $.post(
            config.backend+'api/reset-password',
            {
                email: form.find('[name=email]').val(),
            }
        ).always(function(response) {
            form.find('.error').html('');
            if (response.responseJSON && response.responseJSON.errors) {
                if (response.responseJSON.message)
                    form.find('.form-error').html(response.responseJSON.message);
                form.find('input').each(function () {
                    $(this).next('.error').html(response.responseJSON.errors[$(this).attr('name')]);
                });
            }
            else {
                if (response.success)
                {
                    $('#resetPasswordForm').hide();
                    $('#loginForm').show();
                    $('#login-form-message').html(chrome.i18n.getMessage("newPasswordSended")).show();
                }
                else {
                    form.find('.form-error').html(chrome.i18n.getMessage("undefinedError"));
                }
            }
        });
        return false;
    });
});

//document.getElementById('title').innerHTML = chrome.i18n.getMessage("appName");
// document.getElementById('accessSettings').innerHTML = chrome.i18n.getMessage("accessSettings");
// document.getElementById('allowAccessText1').innerHTML = chrome.i18n.getMessage("allowAccessText1");
// document.getElementById('allowAccessText2').innerHTML = chrome.i18n.getMessage("allowAccessText2");
document.getElementById('registerOrLogin').innerHTML = chrome.i18n.getMessage("registerOrLogin");

$('.nameLabelInput').attr("placeholder", chrome.i18n.getMessage("nameLabel"));
$('.passwordLabelInput').attr("placeholder", chrome.i18n.getMessage("passwordLabel"));

document.getElementById('welcomeBack').innerHTML = chrome.i18n.getMessage("welcomeBack");
document.getElementById('loginText').innerHTML = chrome.i18n.getMessage("loginText");
document.getElementById('registerText').innerHTML = chrome.i18n.getMessage("registerText");

document.getElementById('popupLess').innerHTML = chrome.i18n.getMessage("popupLess");
console.log(chrome.i18n.getMessage("popupLessDesc"));
document.getElementById('popupLessDesc').innerHTML = chrome.i18n.getMessage("popupLessDesc");

document.getElementById('popupMore').innerHTML = chrome.i18n.getMessage("popupMore");
document.getElementById('popupMoreDesc').innerHTML = chrome.i18n.getMessage("popupMoreDesc");

document.getElementById('popupMany').innerHTML = chrome.i18n.getMessage("popupMany");
document.getElementById('popupManyDesc').innerHTML = chrome.i18n.getMessage("popupManyDesc");
document.getElementById('allow_access').innerHTML = chrome.i18n.getMessage("allow_access");

document.getElementById('allow_access').innerHTML = chrome.i18n.getMessage("allow_access");

document.getElementById('resetPasswordText').innerHTML = chrome.i18n.getMessage("passwordRecovery");
document.getElementById('resetPasswordButton').innerHTML = chrome.i18n.getMessage("recover");

document.getElementById('dashboard_link').innerHTML = chrome.i18n.getMessage("dashboard");
document.getElementById('feedback_link').innerHTML = chrome.i18n.getMessage("feedback");

console.log('popup.js loaded');