#include <stdio.h>
#include <stdlib.h>
#define TSF_IMPLEMENTATION
#include "tsf.h"

static void word(FILE* out,unsigned value,int bytes){for(int i=0;i<bytes;i++)fputc((value>>(8*i))&255,out);}

int main(void){
  tsf* font=tsf_load_filename("MuseScore_General.sf2");if(!font)return 1;
  tsf_set_output(font,TSF_STEREO_INTERLEAVED,44100,-6);
  int organ=tsf_get_presetindex(font,0,19);
  /* ponytail: extend the church organ's highest sample by at most one octave; use higher native recordings if available. */
  if(organ>=0)for(int i=0;i<font->presets[organ].regionNum;i++)if(font->presets[organ].regions[i].hikey==96)font->presets[organ].regions[i].hikey=108;
  int program,key,wantedLoop;
  while(scanf("%d %d %d",&program,&key,&wantedLoop)==3){
    int preset=tsf_get_presetindex(font,0,program),count=0,hasLoop=0;
    float head=.5f,settle=.5f,release=.15f;
    if(preset<0)return 2;
    for(int i=0;i<font->presets[preset].regionNum;i++){
      struct tsf_region* r=&font->presets[preset].regions[i];
      if(key<r->lokey||key>r->hikey||90<r->lovel||90>r->hivel)continue;
      count++;if(r->loop_mode&&(r->ampenv.sustain>0.001f||program==125||program==126))hasLoop=1;
      struct tsf_voice_envelope envelope;tsf_voice_envelope_setup(&envelope,&r->ampenv,key,90,1,44100);
      float attack=envelope.parameters.delay+envelope.parameters.attack+envelope.parameters.hold+.25f,steady=attack;
      if(envelope.parameters.sustain>0.001f&&envelope.parameters.sustain<.999f)steady+=envelope.parameters.decay;
      if(attack>head)head=attack;if(steady>settle)settle=steady;
      if(r->ampenv.release>release)release=r->ampenv.release;
    }
    if(!count){printf("{\"program\":%d,\"midi\":%d,\"silent\":true}\n",program,key);fflush(stdout);continue;}
    int loop=wantedLoop&&hasLoop;
    /* ponytail: ASR keeps up to 8s of attack and prepares sustain at up to 30s; exact envelopes need a live SF2 renderer. */
    if(head>8)head=8;if(settle>30)settle=30;if(settle<head)settle=head;
    /* ponytail: one-shot tails stop at 12s; raise this cap for longer natural decays. */
    float seconds=loop?settle+2.0f:12.0f;
    unsigned frames=(unsigned)(seconds*44100+.5f);char name[64];snprintf(name,sizeof(name),"raw/%03d-%03d.wav",program,key);
    tsf_reset(font);for(int i=0;i<font->voiceNum;i++)font->voices[i].playingPreset=-1;
    tsf_note_on(font,preset,key,90.0f/127.0f);
    float* samples=malloc(frames*2*sizeof(float));if(!samples)return 5;
    float peak=0,difference=0;
    for(unsigned offset=0;offset<frames;){unsigned block=frames-offset;if(block>4096)block=4096;tsf_render_float(font,samples+offset*2,block,0);for(unsigned i=offset*2;i<(offset+block)*2;i++)if(fabsf(samples[i])>peak)peak=fabsf(samples[i]);offset+=block;}
    for(unsigned i=0;i<frames;i++)if(fabsf(samples[i*2]-samples[i*2+1])>difference)difference=fabsf(samples[i*2]-samples[i*2+1]);
    if(peak<0.0000001f){free(samples);printf("{\"program\":%d,\"midi\":%d,\"silent\":true}\n",program,key);fflush(stdout);continue;}
    if(!loop){unsigned last=frames;for(;last>2205;last-=2205){double sum=0;for(unsigned i=(last-2205)*2;i<last*2;i++)sum+=samples[i]*samples[i];if(sqrt(sum/4410)>peak*.0031623)break;}if(last+11025<frames)frames=last+11025;}
    unsigned channels=difference>peak*.000001f?2:1;
    for(unsigned i=0;i<frames*channels;i++)samples[i]=samples[channels==1?i*2:i]*.5f/peak;
    FILE* out=fopen(name,"wb");if(!out)return 3;
    fwrite("RIFF",1,4,out);word(out,36+frames*channels*4,4);fwrite("WAVEfmt ",1,8,out);word(out,16,4);word(out,3,2);word(out,channels,2);word(out,44100,4);word(out,44100*channels*4,4);word(out,channels*4,2);word(out,32,2);fwrite("data",1,4,out);word(out,frames*channels*4,4);
    if(fwrite(samples,sizeof(float),frames*channels,out)!=frames*channels)return 4;
    free(samples);fclose(out);
    printf("{\"program\":%d,\"midi\":%d,\"loop\":%s,\"head\":%.6f,\"settle\":%.6f,\"release\":%.6f,\"duration\":%.6f}\n",program,key,loop?"true":"false",head,settle,release,frames/44100.0);fflush(stdout);
  }
  tsf_close(font);return 0;
}
