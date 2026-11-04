#!/usr/bin/env python3
"""InkonabTV support bot for Telegram.

Two jobs:

1. Its own chat (t.me/<bot>): a menu of answers in English or French, and
   automatic answers to typed questions (see faq.py). Every customer message
   is also forwarded to the admin, who answers by replying to it.

2. Telegram Business (needs Telegram Premium on the admin's account): when
   connected under Settings → Telegram Business → Chatbots, it answers the
   admin's own private chats as the admin, in plain text, with the same
   answers. It stays quiet in a chat for a few hours after the admin writes
   there, so it never talks over a real conversation.

Standard library only. Settings live in config.json next to this file.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

import faq

HERE = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(HERE, "config.json")
STATE_PATH = os.path.join(HERE, "state.json")

# Business mode: how long the bot stays quiet in a chat after you write
# there, and how often it may send the "I'll reply soon" note.
QUIET_AFTER_OWNER = 6 * 3600
HOLD_EVERY = 3 * 3600


def load_json(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return default


def save_json(path, data):
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=1)
    os.replace(tmp, path)


CFG = load_json(CONFIG_PATH, None)
if not CFG or not CFG.get("token") or "PASTE" in CFG.get("token", ""):
    sys.exit("config.json is missing or has no bot token. See README.md.")

API = "https://api.telegram.org/bot%s/" % CFG["token"]


def api(method, **params):
    """Call a Bot API method and return its result (None on error)."""
    data = json.dumps(params).encode()
    req = urllib.request.Request(API + method, data=data,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=70) as r:
            return json.load(r).get("result")
    except urllib.error.HTTPError as e:
        print("API %s failed: %s %s" % (method, e.code, e.read()[:300]), flush=True)
    except Exception as e:  # network hiccup: log and carry on
        print("API %s error: %s" % (method, e), flush=True)
    return None


# ---------------------------------------------------------------- texts

def donate_text(lang):
    lines = []
    if CFG.get("paypal_url"):
        lines.append("💳 PayPal: %s" % CFG["paypal_url"])
    if CFG.get("moneygram_name"):
        if lang == "fr":
            lines.append("💸 MoneyGram (https://www.moneygram.com) :\n"
                         "   Bénéficiaire : %s\n   Pays : %s\n"
                         % (CFG["moneygram_name"], CFG.get("moneygram_country_fr", "Maurice")))
        else:
            lines.append("💸 MoneyGram (https://www.moneygram.com):\n"
                         "   Receiver: %s\n   Country: %s\n"
                         % (CFG["moneygram_name"], CFG.get("moneygram_country", "Mauritius")))
    return "\n".join(lines)


def fill(text, lang):
    notes = CFG.get("latest_notes_fr") if lang == "fr" else None
    return text.format(
        apk=CFG["apk_url"], code=CFG["downloader_code"], channel=CFG["channel_url"],
        version=CFG["latest_version"], notes=notes or CFG.get("latest_notes", ""),
        donate=donate_text(lang), facebook=CFG.get("facebook_url", ""))


def label(topic, lang):
    return faq.TOPICS[topic][lang][0]


def answer(topic, lang):
    return fill(faq.TOPICS[topic][lang][1], lang)


UI = {
    "en": {
        "welcome": "👋 Welcome to InkonabTV support!\n\n"
                   "InkonabTV is a free player for your IPTV playlist on Android "
                   "phones, Android TV, Google TV and Fire TV. Samsung TV, iPhone, "
                   "iPad and Mac are coming soon.\n\n"
                   "Pick a topic below, or just type your question: most answers "
                   "come straight away, and a real person reads everything.",
        "received": "✅ Got it, we'll reply as soon as we can.",
        "auto_footer": "\n\nDidn't solve it? Write a bit more (your device, what you "
                       "see) and we'll reply personally.",
        "thanks": "You're welcome! 😊 Anything else, just ask.",
        "back": "⬅️ Back", "main": "🏠 Menu", "start": "Menu",
        "biz_hello": "Hi! 👋 How can I help? If it's about installing the app, "
                     "setting it up or a problem, tell me your device and what's "
                     "happening.",
        "biz_hold": "Hi! Thanks for your message 🙂 I'll reply as soon as I can.",
    },
    "fr": {
        "welcome": "👋 Bienvenue sur le support InkonabTV !\n\n"
                   "InkonabTV est un lecteur gratuit pour votre playlist IPTV sur "
                   "téléphones Android, Android TV, Google TV et Fire TV. Samsung TV, "
                   "iPhone, iPad et Mac arrivent bientôt.\n\n"
                   "Choisissez un sujet, ou écrivez simplement votre question : la "
                   "plupart des réponses arrivent tout de suite, et une vraie personne "
                   "lit tout.",
        "received": "✅ Message reçu, nous vous répondrons dès que possible.",
        "auto_footer": "\n\nPas résolu ? Écrivez-nous un peu plus (votre appareil, ce "
                       "que vous voyez) et nous vous répondrons personnellement.",
        "thanks": "Avec plaisir ! 😊 Une autre question ? N'hésitez pas.",
        "back": "⬅️ Retour", "main": "🏠 Menu", "start": "Menu",
        "biz_hello": "Bonjour ! 👋 Comment puis-je vous aider ? Si c'est pour "
                     "installer l'appli, la configurer ou un problème, dites-moi votre "
                     "appareil et ce qui se passe.",
        "biz_hold": "Bonjour ! Merci pour votre message 🙂 Je vous réponds dès que "
                    "possible.",
    },
}

FR_HINTS = re.compile(r"\b(bonjour|bonsoir|salut|merci|comment|pourquoi|je |j'|"
                      r"ne marche|ça|chaîne|chaine|télé|appli|svp|s'il)\b", re.I)


def lang_of(user, text=""):
    if text and FR_HINTS.search(text):
        return "fr"
    return "fr" if (user or {}).get("language_code", "").startswith("fr") else "en"


# ---------------------------------------------------------------- matching

def _kw_regex(kw):
    return re.compile(r"(?<!\w)%s(?!\w)" % re.escape(kw.lower()))


KW = {t: [(len(k), _kw_regex(k)) for k in v["kw"]] for t, v in faq.TOPICS.items()}
# A few topics are too broad to win on a single short word.
WEAK = {"human", "news", "update"}
# Typed questions on these topics are left for the admin to answer personally
# (people asking for a provider or a subscription).
PERSONAL = {"human", "channels"}
# Guides that lead on to another one get a button for it.
NEXT = {"phone": "plus_setup", "tv": "plus_setup", "firetv": "plus_setup"}


def match_topic(text):
    """Return the best topic for a typed message, or None."""
    t = text.lower()
    best, best_score = None, 0
    for topic, kws in KW.items():
        score = sum(n for n, rx in kws if rx.search(t))
        if topic in WEAK:
            score //= 2
        if score > best_score:
            best, best_score = topic, score
    return best if best_score >= 3 else None


def _only(text, words):
    t = re.sub(r"[!.?,\s]+", " ", text.lower()).strip()
    return t in words


def is_greeting(text):
    return _only(text, faq.GREETINGS) or text.strip().lower().startswith(
        ("/start", "/menu", "/help"))


def is_thanks(text):
    return _only(text, faq.THANKS)


# ---------------------------------------------------------------- keyboards

def item_button(item, lang, parent):
    if item.startswith("menu:"):
        m = item[5:]
        return {"text": faq.MENU_LABELS[m][lang], "callback_data": "m:" + m}
    return {"text": label(item, lang), "callback_data": "t:%s:%s" % (item, parent)}


def menu_keyboard(menu, lang):
    items = [item_button(i, lang, menu) for i in faq.MENUS[menu]]
    width = 2 if menu == "main" else 1
    rows = [items[i:i + width] for i in range(0, len(items), width)]
    if menu != "main":
        rows.append([{"text": UI[lang]["main"], "callback_data": "m:main"}])
    return {"inline_keyboard": rows}


def topic_keyboard(parent, lang, topic=None):
    row = [{"text": UI[lang]["main"], "callback_data": "m:main"}]
    if parent and parent != "main":
        row.insert(0, {"text": UI[lang]["back"], "callback_data": "m:" + parent})
    rows = [row]
    if topic in NEXT:
        rows.insert(0, [item_button(NEXT[topic], lang, parent or "main")])
    return {"inline_keyboard": rows}


def menu_text(menu, lang):
    return UI[lang]["welcome"] if menu == "main" else faq.MENU_INTROS[menu][lang]


# ---------------------------------------------------------------- state

STATE = load_json(STATE_PATH, {})
STATE.setdefault("admin", None)
STATE.setdefault("offset", 0)
STATE.setdefault("links", {})
STATE.setdefault("business", {})   # connection id -> {"owner": id, "enabled": bool}
STATE.setdefault("owner_last", {})  # chat id -> time the owner last wrote there
STATE.setdefault("hold_last", {})   # chat id -> time of the last "I'll reply" note


def remember_link(admin_msg_id, customer_chat_id):
    links = STATE["links"]
    links[str(admin_msg_id)] = customer_chat_id
    if len(links) > 5000:  # keep the file small
        for k in sorted(links, key=int)[:1000]:
            del links[k]


def name_of(user):
    n = " ".join(x for x in [user.get("first_name"), user.get("last_name")] if x)
    if user.get("username"):
        n += " (@%s)" % user["username"]
    return n or str(user.get("id"))


# ---------------------------------------------------------------- bot chat

def handle_admin(msg):
    """Messages from the admin: replies go back to the customer."""
    reply_to = msg.get("reply_to_message")
    target = STATE["links"].get(str(reply_to["message_id"])) if reply_to else None
    if target is None:
        if is_greeting(msg.get("text", "")):  # let the admin see what customers see
            handle_customer_menu(msg)
        elif msg.get("text", "").startswith("/"):
            api("sendMessage", chat_id=msg["chat"]["id"],
                text="You're the admin. Customer messages arrive here; "
                     "reply to one (swipe it or right-click → Reply) to answer.")
        else:
            api("sendMessage", chat_id=msg["chat"]["id"],
                text="⚠️ Not sent. Reply to a customer's message to answer them.")
        return
    sent = api("copyMessage", chat_id=target, from_chat_id=msg["chat"]["id"],
               message_id=msg["message_id"])
    if sent is None:
        api("sendMessage", chat_id=msg["chat"]["id"],
            text="⚠️ Couldn't deliver (the customer may have blocked the bot).")


def forward_to_admin(msg, note):
    admin = STATE.get("admin")
    if not admin:
        return
    user = msg.get("from", {})
    head = api("sendMessage", chat_id=admin,
               text="📩 %s  [id %s]\n%s" % (name_of(user), user.get("id"), note))
    copy = api("copyMessage", chat_id=admin, from_chat_id=msg["chat"]["id"],
               message_id=msg["message_id"])
    if head:
        remember_link(head["message_id"], msg["chat"]["id"])
    if copy:
        remember_link(copy["message_id"], msg["chat"]["id"])


def handle_customer_menu(msg):
    lang = lang_of(msg.get("from"), msg.get("text", ""))
    api("sendMessage", chat_id=msg["chat"]["id"], text=UI[lang]["welcome"],
        reply_markup=menu_keyboard("main", lang), disable_web_page_preview=True)


def handle_customer(msg):
    user = msg.get("from", {})
    chat_id = msg["chat"]["id"]
    text = msg.get("text") or msg.get("caption") or ""
    lang = lang_of(user, text)
    ui = UI[lang]

    if text and is_greeting(text):
        api("sendMessage", chat_id=chat_id, text=ui["welcome"],
            reply_markup=menu_keyboard("main", lang), disable_web_page_preview=True)
        return
    if text and is_thanks(text):
        api("sendMessage", chat_id=chat_id, text=ui["thanks"])
        return

    topic = match_topic(text) if text else None
    if topic and topic not in PERSONAL:
        api("sendMessage", chat_id=chat_id, text=answer(topic, lang) + ui["auto_footer"],
            reply_markup=topic_keyboard("main", lang, topic), disable_web_page_preview=True)
        forward_to_admin(msg, "🤖 Auto-answered: %s" % label(topic, "en"))
    else:
        api("sendMessage", chat_id=chat_id, text=ui["received"])
        forward_to_admin(msg, "❗ Needs your reply" +
                         (" (provider / subscription question)" if topic == "channels" else ""))


def handle_message(msg):
    if msg.get("chat", {}).get("type") != "private":
        return
    user_id = msg.get("from", {}).get("id")
    text = msg.get("text", "")

    if text.strip() == "/admin " + CFG["admin_code"]:
        STATE["admin"] = user_id
        api("sendMessage", chat_id=msg["chat"]["id"],
            text="✅ You're now the admin. Customer messages will arrive here. "
                 "Reply to one to answer that customer.")
        return

    if user_id == STATE.get("admin"):
        handle_admin(msg)
    else:
        handle_customer(msg)


def handle_callback(cq):
    lang = lang_of(cq.get("from"))
    msg = cq.get("message") or {}
    data = cq.get("data") or ""
    api("answerCallbackQuery", callback_query_id=cq["id"])
    if not msg:
        return
    if data.startswith("m:") and data[2:] in faq.MENUS:
        menu = data[2:]
        body, kb = menu_text(menu, lang), menu_keyboard(menu, lang)
    elif data.startswith("t:"):
        _, topic, parent = (data.split(":") + ["main"])[:3]
        if topic not in faq.TOPICS:
            return
        body, kb = answer(topic, lang), topic_keyboard(parent, lang, topic)
    elif data in faq.TOPICS:  # buttons from the first version of the bot
        body, kb = answer(data, lang), topic_keyboard("main", lang)
    else:
        body, kb = menu_text("main", lang), menu_keyboard("main", lang)
    api("editMessageText", chat_id=msg["chat"]["id"], message_id=msg["message_id"],
        text=body, reply_markup=kb, disable_web_page_preview=True)


# ---------------------------------------------------------------- business

def handle_business_connection(bc):
    STATE["business"][bc["id"]] = {"owner": bc["user"]["id"],
                                   "enabled": bc.get("is_enabled", True)}
    print("Business connection %s: owner %s, %s" % (
        bc["id"], name_of(bc["user"]),
        "on" if bc.get("is_enabled", True) else "off"), flush=True)


def handle_business_message(msg, now=None):
    now = now or time.time()
    conn = STATE["business"].get(msg.get("business_connection_id"))
    if not conn or not conn.get("enabled") or msg.get("chat", {}).get("type") != "private":
        return
    chat_id = str(msg["chat"]["id"])
    sender = msg.get("from", {})

    if sender.get("id") == conn["owner"]:
        STATE["owner_last"][chat_id] = now  # you're talking: stay quiet here
        return
    if sender.get("is_bot"):
        return
    if now - STATE["owner_last"].get(chat_id, 0) < QUIET_AFTER_OWNER:
        return

    text = msg.get("text") or msg.get("caption") or ""
    lang = lang_of(sender, text)
    ui = UI[lang]
    if text and is_greeting(text):
        reply = ui["biz_hello"]
    elif text and is_thanks(text):
        reply = ui["thanks"]
    else:
        topic = match_topic(text) if text else None
        if topic and topic not in PERSONAL:
            reply = answer(topic, lang)
        elif now - STATE["hold_last"].get(chat_id, 0) >= HOLD_EVERY:
            reply = ui["biz_hold"]
            STATE["hold_last"][chat_id] = now
        else:
            return
    api("sendMessage", business_connection_id=msg["business_connection_id"],
        chat_id=msg["chat"]["id"], text=reply, disable_web_page_preview=True)


# ---------------------------------------------------------------- main loop

def setup_profile():
    for lang in ("en", "fr"):
        params = {"commands": [{"command": "start", "description": UI[lang]["start"]}]}
        if lang == "fr":
            params["language_code"] = "fr"
        api("setMyCommands", **params)
    api("setMyName", name="InkonabTV Support")
    api("setMyDescription",
        description="📺 Official InkonabTV support.\n\nInstall help for Android phones, "
                    "Android TV, Google TV and Fire TV, playlist setup, fixes for common "
                    "problems, the latest version and donations. Press Start, or just "
                    "write your question.\n\n🇫🇷 Assistance officielle InkonabTV, en "
                    "français aussi.")
    api("setMyDescription", language_code="fr",
        description="📺 Assistance officielle InkonabTV.\n\nAide à l'installation "
                    "(téléphones Android, Android TV, Google TV, Fire TV), ajout de "
                    "playlist, solutions aux problèmes courants, dernière version et "
                    "dons. Appuyez sur Démarrer, ou écrivez votre question.")
    api("setMyShortDescription",
        short_description="📺 Official InkonabTV support · news: %s" % CFG["channel_url"])


def handle_update(u):
    if "message" in u:
        handle_message(u["message"])
    elif "callback_query" in u:
        handle_callback(u["callback_query"])
    elif "business_connection" in u:
        handle_business_connection(u["business_connection"])
    elif "business_message" in u:
        handle_business_message(u["business_message"])


def main():
    me = api("getMe")
    if not me:
        sys.exit("Couldn't reach Telegram. Check the token in config.json.")
    print("Running as @%s, admin %s, business mode %s" % (
        me["username"], STATE.get("admin"),
        "available" if me.get("can_connect_to_business") else "off in BotFather"),
        flush=True)
    api("deleteWebhook")
    setup_profile()
    while True:
        updates = api("getUpdates", offset=STATE["offset"], timeout=50,
                      allowed_updates=["message", "callback_query",
                                       "business_connection", "business_message"])
        if updates is None:
            time.sleep(5)
            continue
        for u in updates:
            STATE["offset"] = u["update_id"] + 1
            try:
                handle_update(u)
            except Exception as e:  # one bad update must not stop the bot
                print("Update %s failed: %r" % (u.get("update_id"), e), flush=True)
        if updates:
            save_json(STATE_PATH, STATE)


if __name__ == "__main__":
    main()
