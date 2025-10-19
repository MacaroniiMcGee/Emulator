#define _GNU_SOURCE
#include <errno.h>
#include <getopt.h>
#include <gpiod.h>
#include <stdint.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

typedef enum { PAR_STD=0, PAR_NONE=1, PAR_WHOLE_EVEN=2, PAR_WHOLE_ODD=3 } parity_mode_t;

typedef struct {
  const char *chip_name;
  unsigned int d0_line, d1_line;
  int frame_bits;
  int facility_bits, card_bits;
  int format_bits;
  uint64_t facility, card;
  const char *raw_bits;
  parity_mode_t parity;
  int pulse_us, space_us;
} cfg_t;

static void usage(const char *p) {
  fprintf(stderr,
    "Usage: %s --chip gpiochip0 --d0 <line> --d1 <line>\n"
    "  [--format 26|34|35|37|48]\n"
    "  [--facility N --card N [--facility-bits N --card-bits N]]\n"
    "  [--raw-bits <0xHEX|1010..>] [--frame-bits N]\n"
    "  [--parity std|none|whole-even|whole-odd]\n"
    "  [--pulse-us 50] [--space-us 1000]\n", p);
}

static void die(const char *m) { fprintf(stderr, "wiegand_tx: %s\n", m); exit(2); }

static void sleep_us(int us) {
  struct timespec ts; ts.tv_sec = us/1000000; ts.tv_nsec = (us%1000000)*1000;
  while (nanosleep(&ts, &ts) == -1 && errno == EINTR) {}
}

static int parse_parity(const char *s) {
  if (!s) return PAR_STD;
  if (!strcmp(s,"std")) return PAR_STD;
  if (!strcmp(s,"none")) return PAR_NONE;
  if (!strcmp(s,"whole-even")) return PAR_WHOLE_EVEN;
  if (!strcmp(s,"whole-odd")) return PAR_WHOLE_ODD;
  die("invalid --parity");
  return PAR_STD;
}

static int parity_even_bits(const uint8_t *b, int n){
  int c=0; for (int i=0;i<n;i++) if (b[i]) c++; return (c%2)==0;
}

static int parse_raw_bits(const char *raw, uint8_t *bits, int max){
  if (!raw) return 0;
  int n=0;
  if (!strncmp(raw,"0x",2) || !strncmp(raw,"0X",2)) {
    const char *p = raw+2; if (!*p) die("empty hex");
    for (const char *q=p; *q; ++q) {
      int ok = ((*q>='0'&&*q<='9')||(*q>='a'&&*q<='f')||(*q>='A'&&*q<='F'));
      if (!ok) die("bad hex in raw");
      int v = (*q>='0'&&*q<='9')? *q-'0' : (*q>='a'&&*q<='f')? 10+*q-'a' : 10+*q-'A';
      if (n+4>max) die("raw hex too long");
      bits[n++] = (v&8)?1:0;
      bits[n++] = (v&4)?1:0;
      bits[n++] = (v&2)?1:0;
      bits[n++] = (v&1)?1:0;
    }
  } else {
    for (const char *p=raw; *p; ++p) {
      if (*p=='0'||*p=='1') { if (n>=max) die("raw bits too long"); bits[n++]=(*p=='1'); }
      else if (*p==' '||*p=='_') continue;
      else die("invalid char in raw bits");
    }
  }
  return n;
}

static int compose_fields(uint64_t f, int fb, uint64_t c, int cb, uint8_t *out, int max){
  int n = fb+cb; if (n>max) die("buffer small");
  for (int i=0;i<fb;i++){ int idx=fb-1-i; out[i] = (f>>idx)&1ULL; }
  for (int i=0;i<cb;i++){ int idx=cb-1-i; out[fb+i] = (c>>idx)&1ULL; }
  return n;
}

static int apply_parity(const uint8_t *data, int dlen, parity_mode_t mode, uint8_t *frame, int max){
  if (mode==PAR_NONE) { if (dlen>max) die("buffer small"); memcpy(frame,data,dlen); return dlen; }
  if (mode==PAR_WHOLE_EVEN || mode==PAR_WHOLE_ODD) {
    if (dlen+1>max) die("buffer small");
    memcpy(frame,data,dlen);
    int pe = parity_even_bits(data,dlen);
    frame[dlen] = (mode==PAR_WHOLE_EVEN) ? (pe?1:0) : (pe?0:1);
    return dlen+1;
  }
  int left = dlen/2, right = dlen-left;
  if (dlen+2>max) die("buffer small");
  int pe_left = parity_even_bits(data,left);
  int pe_right = parity_even_bits(data+left,right);
  frame[0] = pe_left ? 1 : 0;
  memcpy(frame+1, data, dlen);
  frame[1+dlen] = pe_right ? 0 : 1;
  return dlen+2;
}

int main(int argc, char **argv){
  cfg_t cfg = {
    .chip_name="gpiochip0",
    .d0_line=(unsigned int)-1, .d1_line=(unsigned int)-1,
    .frame_bits=0, .facility_bits=-1, .card_bits=-1, .format_bits=26,
    .facility=0, .card=0, .raw_bits=NULL, .parity=PAR_STD,
    .pulse_us=50, .space_us=1000
  };

  static struct option opts[] = {
    {"chip",1,0,'c'}, {"d0",1,0,'0'}, {"d1",1,0,'1'},
    {"format",1,0,'f'}, {"frame-bits",1,0,'B'},
    {"facility",1,0,'F'}, {"card",1,0,'C'},
    {"facility-bits",1,0,'x'}, {"card-bits",1,0,'y'},
    {"raw-bits",1,0,'r'}, {"parity",1,0,'p'},
    {"pulse-us",1,0,'u'}, {"space-us",1,0,'s'},
    {0,0,0,0}
  };

  int ch;
  while ((ch=getopt_long(argc,argv,"",opts,NULL))!=-1){
    switch(ch){
      case 'c': cfg.chip_name=optarg; break;
      case '0': cfg.d0_line=(unsigned int)atoi(optarg); break;
      case '1': cfg.d1_line=(unsigned int)atoi(optarg); break;
      case 'f': cfg.format_bits=atoi(optarg); break;
      case 'B': cfg.frame_bits=atoi(optarg); break;
      case 'F': cfg.facility=strtoull(optarg,NULL,0); break;
      case 'C': cfg.card=strtoull(optarg,NULL,0); break;
      case 'x': cfg.facility_bits=atoi(optarg); break;
      case 'y': cfg.card_bits=atoi(optarg); break;
      case 'r': cfg.raw_bits=optarg; break;
      case 'p': cfg.parity=parse_parity(optarg); break;
      case 'u': cfg.pulse_us=atoi(optarg); break;
      case 's': cfg.space_us=atoi(optarg); break;
      default: usage(argv[0]); return 2;
    }
  }

  if ((int)cfg.d0_line<0 || (int)cfg.d1_line<0) { usage(argv[0]); return 2; }
  if (cfg.pulse_us<20 || cfg.pulse_us>5000) die("pulse-us out of range");
  if (cfg.space_us<cfg.pulse_us) die("space-us must be >= pulse-us");

  uint8_t data[512]; int dlen=0;
  if (cfg.raw_bits) {
    dlen = parse_raw_bits(cfg.raw_bits, data, (int)sizeof(data));
  } else {
    int N = cfg.format_bits;
    if (!(N==26 || N==34 || N==35 || N==37 || N==48)) die("unsupported format");
    int fb = cfg.facility_bits, cb = cfg.card_bits;
    if (fb<0 || cb<0) {
      switch (N) {
        case 26: fb=8;  cb=16; break;
        case 34: fb=16; cb=16; break;
        case 37: fb=18; cb=16; break;
        case 35: fb=19; cb=16; break;
        case 48: fb=16; cb=30; break;
      }
    }
    if (cfg.facility >= (1ULL<<fb) || cfg.card >= (1ULL<<cb))
      die("facility/card exceeds width");
    dlen = compose_fields(cfg.facility, fb, cfg.card, cb, data, (int)sizeof(data));
    if (cfg.parity==PAR_NONE && cfg.frame_bits>0) {
      if (cfg.frame_bits<dlen) die("frame-bits < data bits");
      if (cfg.frame_bits>dlen) {
        int pad = cfg.frame_bits - dlen; if (cfg.frame_bits>(int)sizeof(data)) die("frame-bits too large");
        memmove(data+pad, data, dlen); memset(data, 0, pad); dlen = cfg.frame_bits;
      }
    }
  }

  uint8_t frame[520];
  int flen = apply_parity(data, dlen, cfg.parity, frame, (int)sizeof(frame));
  if (cfg.frame_bits>0 && cfg.frame_bits!=flen) die("frame-bits mismatch");

  char devpath[128];
  snprintf(devpath, sizeof(devpath), "/dev/%s", cfg.chip_name);

  struct gpiod_chip *chip = gpiod_chip_open(devpath);
  if (!chip) die("open gpiochip failed");

  struct gpiod_line_settings *ls = gpiod_line_settings_new();
  if (!ls) die("line_settings_new failed");
  gpiod_line_settings_set_direction(ls, GPIOD_LINE_DIRECTION_OUTPUT);
  gpiod_line_settings_set_output_value(ls, 1);

  struct gpiod_line_config *lcfg = gpiod_line_config_new();
  if (!lcfg) die("line_config_new failed");

  unsigned int offsets[2] = { cfg.d0_line, cfg.d1_line };
  if (gpiod_line_config_add_line_settings(lcfg, offsets, 2, ls) < 0)
    die("line_config_add_line_settings failed");

  struct gpiod_request_config *rcfg = gpiod_request_config_new();
  if (!rcfg) die("request_config_new failed");
  gpiod_request_config_set_consumer(rcfg, "wiegand_tx");

  struct gpiod_line_request *req = gpiod_chip_request_lines(chip, rcfg, lcfg);
  if (!req) die("chip_request_lines failed (permissions or busy?)");

  int init_vals[2] = {1,1};
  if (gpiod_line_request_set_values(req, init_vals) < 0) die("set idle high failed");
  sleep_us(2000);

  for (int i=0; i<flen; ++i) {
    unsigned int pulse_offset = (frame[i]==0) ? cfg.d0_line : cfg.d1_line;
    if (gpiod_line_request_set_value(req, pulse_offset, 0) < 0) die("set low failed");
    sleep_us(cfg.pulse_us);
    if (gpiod_line_request_set_value(req, pulse_offset, 1) < 0) die("set high failed");
    sleep_us(cfg.space_us);
  }

  if (gpiod_line_request_set_values(req, init_vals) < 0) die("restore high failed");
  gpiod_line_request_release(req);
  gpiod_line_config_free(lcfg);
  gpiod_line_settings_free(ls);
  gpiod_chip_close(chip);
  return 0;
}
