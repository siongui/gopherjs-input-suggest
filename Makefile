export GOROOT=$(realpath ../go)
export GOPATH=$(realpath .)
export PATH := $(GOROOT)/bin:$(GOPATH)/bin:$(PATH)

devserver: local js
	@echo "\033[92mDevelopment Server Running ...\033[0m"
	@go run example/server.go

js:
	@echo "\033[92mGenerating JavaScript ...\033[0m"
	@gopherjs build example/suggest.go -o example/suggest.js

fmt:
	@echo "\033[92mGo fmt source code...\033[0m"
	@go fmt *.go
	@go fmt example/*.go

local:
	@cp suggest.go src/github.com/siongui/gopherjs-input-suggest/

install:
	@echo "\033[92mInstalling GopherJS ...\033[0m"
	go get -u github.com/gopherjs/gopherjs
	go get -u github.com/siongui/gopherjs-utils
	go get -u github.com/siongui/gopherjs-input-suggest
