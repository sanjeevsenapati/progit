#!/usr/bin/env bash
exec docker logs -f --tail "${1:-100}" progit
