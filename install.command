#!/usr/bin/env sh
rm cache.txt
touch cache.txt
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.zprofile
nvm install node
nvm install 22
nvm use 22
npm install --global yarn
yarn