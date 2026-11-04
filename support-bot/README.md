# InkonabTV support bot

A free Telegram bot that answers customers automatically and forwards everything
else to you. You only reply.

What customers get when they press **Start**: a menu (English, or French if their
Telegram is in French) with Android phone install, Android TV / Fire TV install,
adding a playlist, the latest version, donations (PayPal and MoneyGram), and
"Talk to us". Anything they type or send (text, screenshots) reaches you.

How you answer: their message appears in your chat with the bot. **Reply** to it
(swipe left on phone, or right-click → Reply on desktop) and the bot sends your
answer to them. A message that isn't a reply isn't sent anywhere.

Standard library Python only, no packages to install.

## 1. Create the bot (2 minutes, in Telegram)

1. Open **@BotFather**, send `/newbot`.
2. Name: `InkonabTV Support Bot` (any). Username: must end in `bot`, for example
   `InkonabTVHelpBot`.
3. BotFather gives you a **token** like `123456:ABC...`. Keep it secret.
4. Optional, in BotFather: `/setuserpic` → send `store/facebook/profile.png`.

## 2. Put the token in config.json

Open `config.json` in this folder and replace `PASTE_THE_BOTFATHER_TOKEN_HERE`
with the token. Everything else (links, version, donation details) is already
filled in; edit it whenever something changes. `config.json` is git-ignored.

## 3. Run it on alwaysdata (free, stays on 24/7)

1. Upload this whole `support-bot` folder to your alwaysdata account, for example
   to `/home/<account>/support-bot/` (Remote access → FTP/SFTP, or the file
   manager).
2. In the alwaysdata admin: **Advanced → Services → Add a service**.
   - Command: `python3 /home/<account>/support-bot/bot.py`
   - Working directory: `/home/<account>/support-bot`
   - Save. The service starts and restarts by itself.
3. Check **Services → Logs**: you should see `Running as @YourBotName`.

To try it on the Mac first instead: `python3 bot.py` in this folder (stop with
Ctrl+C). Only run one copy at a time.

## 4. Make yourself the admin (once)

Open your bot in Telegram from the account you'll answer from and send:

```
/admin <admin_code from config.json>
```

It replies "You're now the admin". From then on, customer messages land there.

## 5. Tell customers

Use the bot's link `https://t.me/<YourBotUsername>` in the channel description,
posts, the Facebook page and the app, instead of @InkonabTV.

## 6. Let it answer your own chats as you (Telegram Business)

This needs **Telegram Premium** on your account. Secretary (Business) mode is
already switched on for the bot in BotFather.

1. On your phone: Settings → Telegram Business → Chatbots.
2. Enter `@InkonabTVHelpBot`, choose which chats it may answer (for example
   "All non-contacts", and exclude friends and family), and allow it to reply.

It then answers people who write to @InkonabTV, as you, in plain text:
greetings, the known questions from `faq.py`, and otherwise "I'll reply as soon
as I can" (at most once every 3 hours per chat). As soon as you write in a chat
yourself, it stays quiet there for 6 hours. The bot's log shows
"Business connection … on" once it's connected.

## Updating the answers

All questions, answers and keywords are in `faq.py` (English and French). Add a
topic there and put its id in one of the `MENUS` to give it a button.


Change `config.json` (new version number, notes, links) and restart the service
(alwaysdata: Services → Restart). The button texts themselves are in `texts()`
in `bot.py`.
