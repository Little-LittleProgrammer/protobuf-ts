API_PROTO_FILES=$(shell find protos -name *.proto)

default:  generate npm-build

npm-build:
	npm run build

generate:
	# 只生成ts的message
	npx protoc --proto_path=./protos \
	       --proto_path=./third_party \
		   --ts_out=. \
		   --ts_opt=only_http \
		   --ts_opt=long_type_number \
	    	$(API_PROTO_FILES)
	node ./bin/index.js


