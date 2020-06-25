#!/bin/bash

set -e

# install tmate
if [[ "$(uname)" = "Darwin" ]]; then
  brew install tmate
else
  cid=$(docker create tmate/tmate)
  sudo docker cp $cid:/build/tmate /usr/local/bin/tmate
fi

# set up ssh authorized_keys if it does not exist
[[ ! -d ~/.ssh ]] && {
  mkdir ~/.ssh
  chmod 700 ~/.ssh
}
[[ ! -f ~/.ssh/authorized_keys || $TMATE_AUTHORIZED_KEYS_URL ]] && {
  curl --fail -sLo ~/.ssh/authorized_keys "$TMATE_AUTHORIZED_KEYS_URL"
  chmod 600 ~/.ssh/authorized_keys
}

if [[ -f ~/.ssh/authorized_keys ]]; then
  tmate -a ~/.ssh/authorized_keys -S /tmp/tmate.sock new-session -d
else
  tmate -S /tmp/tmate.sock new-session -d
fi
tmate -S /tmp/tmate.sock wait tmate-ready
ssh_url="$(tmate -S /tmp/tmate.sock display -p '#{tmate_ssh}')"
curl -X POST -H 'Content-type: application/json' --data "{\"text\":\"$ssh_url\"}" "$SLACK_WEBHOOK_URL_FOR_TMATE_FROM_GITHUB_WORKFLOW"

sleep 14400 # 4 hours
