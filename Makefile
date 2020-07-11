export GOROOT=$(realpath ../paligo/go)
export GOPATH=$(realpath ../paligo)
export PATH := $(GOROOT)/bin:$(GOPATH)/bin:$(PATH)

PKG="github.com/siongui/gopherjs-input-suggest"

devserver: local js
	@echo "\033[92mDevelopment Server Running ...\033[0m"
	@go run devserver/server.go

js:
	@echo "\033[92mGenerating JavaScript ...\033[0m"
	@gopherjs build example/suggest.go -o example/suggest.js

fmt:
	@echo "\033[92mGo fmt source code...\033[0m"
	@go fmt *.go
	@go fmt example/*.go

local:
	@[ -d src/${PKG}/ ] || mkdir -p src/${PKG}/
	@cp *.go src/${PKG}/

install:
	@echo "\033[92mInstalling GopherJS and necessary packages ...\033[0m"
	go get -u github.com/gopherjs/gopherjs
	go get -u github.com/siongui/godom
	@#go get -u ${PKG}

deploy:
	@echo "\033[92mDeploy to GitHub Pages (Project) ...\033[0m"
	@rm example/*.go
	@ghp-import example/
	@git push origin gh-pages
	@git checkout example/
