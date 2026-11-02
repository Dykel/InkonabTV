# Video relay on alwaysdata

The provider's video server refuses Cloudflare (403), so the website's relay runs on
alwaysdata instead: https://inkonabtv.alwaysdata.net/relay/

Install or update (alwaysdata web terminal):

    mkdir -p ~/www/relay && curl -sL https://raw.githubusercontent.com/Dykel/InkonabTV/main/proxy/alwaysdata/index.php -o ~/www/relay/index.php
    [ -s ~/relay-secret ] || php -r 'echo bin2hex(random_bytes(24));' > ~/relay-secret

The secret stays outside www/. config.js `relay:` points to https://inkonabtv.alwaysdata.net/relay
