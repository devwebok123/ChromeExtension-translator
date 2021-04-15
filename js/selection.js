console.log("highlight toolbox");

function isTextBox(e) {
  try {
    return (
      (e.target instanceof HTMLInputElement &&
        ["text", "search", "password"].indexOf(e.target.type) > -1) ||
      e.target instanceof HTMLTextAreaElement
    );
  } catch (ex) {
    return false;
  }
}

function isTextArea(e) {
  try {
    return (
      document.activeElement &&
      document.activeElement.tagName.toUpperCase() == "TEXTAREA"
    );
  } catch (ex) {
    return false;
  }
}

function getAdjustedXY(e) {
  var x = e.pageX,
    y = e.pageY,
    x_client = e.clientX,
    y_client = e.clientY;
  if (x_client < 0) {
    x -= x_client;
    x_client = 0;
  } else if (x_client > window.innerWidth) {
    x -= x_client - window.innerWidth;
    x_client = window.innerWidth;
  }
  if (y_client < 0) {
    y -= y_client;
    y_client = 0;
  } else if (
    document.body.clientHeight &&
    y_client > document.body.clientHeight
  ) {
  }
  return [x, y, x_client, y_client];
}

var selection = null;
document.addEventListener(
  "mouseup",
  function (e) {
    if (words_parser.config.highlightEnabled == false) {
      return;
    }

    if (words_parser.isBlocked()) {
      return;
    }

    let html_lang = getDocuemntLang();
    if (words_parser.localizations.indexOf(html_lang) == -1) {
      return;
    }
    /*if (chrome.i18n.getMessage("locale") != html_lang) {
        return;
    }*/

    var target = $(e.target);
    if (target.attr("id") == "dokiwi-google-translate") {
      return;
    }
    /*
    if (isTextBox(e))
        return;
    if (isTextArea(e))
        return;
    if (window.getSelection().anchorNode == null || window.getSelection().anchorNode.nodeType != Node.TEXT_NODE)
        return;
    if (window.getSelection().focusNode == null || window.getSelection().focusNode.nodeType != Node.TEXT_NODE)
        return;
    */
    selection = window.getSelection().toString().trim();
    if (selection.length > 0) {
      var [x, y, x_client, y_client] = getAdjustedXY(e);
      x = x + 200 < window.innerWidth ? x - 10 : window.innerWidth - 240 - 10;
      renderToolBox(x, y + 12, selection);
    } else {
      selection = null;
    }
    console.log("selection : " + selection);
  },
  false
);

document.addEventListener(
  "mousedown",
  function (e) {
    var target = $(e.target);
    if (target.attr("id") == "dokiwi-google-translate") {
      return;
    }
    $("#dokiwi-highlight-toolbox").hide();
    $("#dokiwi-highlight-translation").hide();
    if (window.getSelection().rangeCount > 0) {
      window.getSelection().removeAllRanges();
    }
  },
  false
);

function renderToolBox(mouseX, mouseY, selection) {
  $("#dokiwi-highlight-toolbox").css("top", mouseY + "px");
  $("#dokiwi-highlight-toolbox").css("left", mouseX + "px");
  $("#dokiwi-highlight-toolbox").show();
}

function renderTranslated(mouseX, mouseY) {
  count++;
  console.log(count);
  $("#dokiwi-highlight-translation").css("top", mouseY + "px");
  $("#dokiwi-highlight-translation").css("left", mouseX + "px");
  $("#dokiwi-highlight-translation").show();
}

var count = 0;

var logoUrl = chrome.extension.getURL("/image/logo_48.png");
toolbox_html =
  '<div class="dokiwi-toolbox" id="dokiwi-highlight-toolbox">' +
  '<div style="flex:1; display:flex"><img src="' +
  logoUrl +
  '" width="24px" height="24px">' +
  "</div>" +
  '<div style="flex:4; display:flex" id="dokiwi-google-translate">To English' +
  "</div>" +
  "</div>";
translation_html =
  '<div class="dokiwi-translation" id="dokiwi-highlight-translation">' +
  '<div id="dokiwi-original" style="padding-top:16px">' +
  "</div>" +
  '<div class="dokiwi-translation-close">' +
  "</div>" +
  '<div id="dokiwi-translated" style="padding-top:8px">' +
  "</div>" +
  "</div>";

let cloned_toolbox = $(toolbox_html).clone();
$("body").append(cloned_toolbox);

let cloned_translation = $(translation_html).clone();
$("body").append(cloned_translation);
$("#dokiwi-highlight-toolbox").hide();
$("#dokiwi-highlight-translation").hide();

$("#dokiwi-google-translate").html(chrome.i18n.getMessage("to_english"));

$("#dokiwi-google-translate").on("click", function (e) {
  if (!selection || selection.length == 0) {
    return;
  }

  console.log("clicked google translation");

  $("#dokiwi-highlight-toolbox").hide();

  $("#dokiwi-original").text(selection);
  $("#dokiwi-translated").text(chrome.i18n.getMessage("translating"));
  var [x, y, x_client, y_client] = getAdjustedXY(e);
  x =
    x + 400 < window.innerWidth
      ? x - parseInt($("#dokiwi-highlight-translation").css("width")) / 2
      : window.innerWidth - 400 - 10;
  renderTranslated(x, y);

  $.ajax({
    url: "https://api.dokiwi.com/api/user",
    data: {
      word: selection,
      lang_from: getDocuemntLang(),
    },
    headers: words_parser.config.token
      ? { Authorization: "Bearer " + words_parser.config.token }
      : {},
  }).done(function (response) {
    response = JSON.parse(response);
    if (response.success && response.translation != selection) {
      console.log("translation result");
      console.log(response);
      $("#dokiwi-translated").text(response.translation);
    } else {
      $(".dokiwi-translation-translate").hide();
    }
  });
});

$(".dokiwi-translation-close").on("click", function () {
  $("#dokiwi-translation-translate").hide();
});
