CC := cc
CFLAGS := -O2 -Wall -Wextra -std=c11
LDFLAGS := -lgpiod

SRC := wiegand_tx.c
BIN_DIR := ../bin
OUT := $(BIN_DIR)/wiegand_tx

all: $(OUT)

$(OUT): $(SRC)
	@mkdir -p $(BIN_DIR)
	$(CC) $(CFLAGS) -o $@ $< $(LDFLAGS)

clean:
	rm -f $(OUT)
