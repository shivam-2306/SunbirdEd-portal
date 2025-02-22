//import { ConfigService, NavigationHelperService, UtilService } from '@sunbird/shared';
import { Component, AfterViewInit, ViewChild, ElementRef, Input, Output, EventEmitter,
  OnChanges, HostListener, OnInit, ChangeDetectorRef, Inject } from '@angular/core';
  import * as _ from 'lodash-es';
  import { Router } from '@angular/router';
  const OFFLINE_ARTIFACT_MIME_TYPES = ['application/epub'];
  import { Subject } from 'rxjs';
  import { DeviceDetectorService } from 'ngx-device-detector';
  import { OnDestroy } from '@angular/core';
  import { takeUntil } from 'rxjs/operators';
  import { CsContentProgressCalculator } from '@project-sunbird/client-services/services/content/utilities/content-progress-calculator';
  import { ContentpageService, IInteractEventEdata,PlayerConfig } from '../contentpageinterfaces';
  
  
  @Component({
    selector: 'app-player',
    templateUrl: './player.component.html',
    styleUrls: ['./player.component.scss']
  })
  export class PlayerComponent implements OnInit, AfterViewInit, OnChanges, OnDestroy {
    @Input() playerConfig: PlayerConfig;
    @Output() assessmentEvents = new EventEmitter<any>();
    @Output() questionScoreSubmitEvents = new EventEmitter<any>();
    @Output() questionScoreReviewEvents = new EventEmitter<any>();
    @ViewChild('contentIframe') contentIframe: ElementRef;
    @Output() playerOnDestroyEvent = new EventEmitter<any>();
    @Output() sceneChangeEvent = new EventEmitter<any>();
    @Input() contentProgressEvents$: Subject<any>;
    playerLoaded = false;
    buildNumber: string;
    @Input() playerOption: any;
    contentRatingModal = false;
    showRatingModalAfterClose = false;
    previewCdnUrl: string;
    isCdnWorking: string;
    CONSTANT = {
      ACCESSEVENT: 'renderer:question:submitscore',
      ISLASTATTEMPT: 'renderer:selfassess:lastattempt',
      MAXATTEMPT: 'renderer:maxLimitExceeded',
      ACCESSREVIEWEVENT: 'renderer:question:reviewAssessment'
    };
    @Input() overlayImagePath: string;
    @Input() isSingleContent: boolean;
    @Input() telemetryObject: {};
    @Input() pageId: string;
    @Input() contentData;
    @Input() isContentDeleted: Subject<any>;
    @Output() closePlayerEvent = new EventEmitter<any>();
    @Output() ratingPopupClose = new EventEmitter<any>();
    @Output() selfAssessLastAttempt = new EventEmitter<any>();
    contentDeleted = false;
    isMobileOrTab: boolean;
    showPlayIcon = true;
    closeButtonInteractEdata: IInteractEventEdata;
    loadPlayerInteractEdata: IInteractEventEdata;
    playerOverlayImage: string;
    isFullScreenView = false;
    public unsubscribe = new Subject<void>();
    public showNewPlayer = false;
    mobileViewDisplay = 'block';
    playerType: string;
    isDesktopApp = false;
    showQumlPlayer = false;
    contentId: string;
    collectionId:string;
  
    /**
   * Dom element reference of contentRatingModal
   */
    @ViewChild('modal') modal;
  
    @HostListener('window:popstate', ['$event'])
    onPopState(event) {
      this.closeContentFullScreen();
    }
  
    constructor(@Inject('ContentpageService') public config: ContentpageService,  public router: Router,
      private deviceDetectorService: DeviceDetectorService, private cdr: ChangeDetectorRef) {
      this.buildNumber = (<HTMLInputElement>document.getElementById('buildNumber'))
        ? (<HTMLInputElement>document.getElementById('buildNumber')).value : '1.0';
      this.previewCdnUrl = (<HTMLInputElement>document.getElementById('previewCdnUrl'))
        ? (<HTMLInputElement>document.getElementById('previewCdnUrl')).value : undefined;
      this.isCdnWorking = (<HTMLInputElement>document.getElementById('cdnWorking'))
        ? (<HTMLInputElement>document.getElementById('cdnWorking')).value : 'no';
    }
  
    @HostListener('window:orientationchange', ['$event'])
    public handleOrientationChange() {
      const screenType = _.get(screen, 'orientation.type');
        if ( screenType === 'portrait-primary' || screenType === 'portrait-secondary' ) {
          this.closeFullscreen();
        }
    }
  
    ngOnInit() {
      this.checkForQumlPlayer()
      // If `sessionStorage` has UTM data; append the UTM data to context.cdata
      if (this.playerConfig && sessionStorage.getItem('UTM')) {
        let utmData;
        try {
          utmData = JSON.parse(sessionStorage.getItem('UTM'));
        } catch (error) {
          throw new Error('JSON Parse Error => UTM data');
        }
        if (utmData && _.get(this.playerConfig, 'context.cdata')) {
          this.playerConfig.context.cdata = _.union(this.playerConfig.context.cdata, utmData);
        }
        if (utmData && !_.get(this.playerConfig, 'context.cdata')) {
          this.playerConfig.context['cdata'] = [];
          this.playerConfig.context.cdata = _.union(this.playerConfig.context.cdata, utmData);
        }
      }
      this.isDesktopApp = this.config.getutilService().isDesktopApp;
      // Check for loggedIn user; and append user data to context object
      // User data (`firstName` and `lastName`) is used to show at the end of quiz
      if (this.playerConfig) {
          this.addUserDataToContext();
      }
      this.isMobileOrTab = this.deviceDetectorService.isMobile() || this.deviceDetectorService.isTablet();
      if (this.isSingleContent === false) {
        this.showPlayIcon = false;
      }
      this.setTelemetryData();
      this.config.getnavigationHelperService().contentFullScreenEvent.
      pipe(takeUntil(this.unsubscribe)).subscribe(isFullScreen => {
        this.isFullScreenView = isFullScreen;
        const root: HTMLElement = document.getElementsByTagName( 'html' )[0];
        if (isFullScreen) {
          root.classList.add('PlayerMediaQueryClass');
          document.body.classList.add('o-y-hidden');
        } else {
          root.classList.remove('PlayerMediaQueryClass');
          document.body.classList.remove('o-y-hidden');
        }
        if (this.isDesktopApp) {
          const hideCM = isFullScreen ? true : false;
          this.config.getnavigationHelperService().handleContentManagerOnFullscreen(hideCM);
        }
        this.loadPlayer();
      });
  
      this.config.getcontentUtilsServiceService().contentShareEvent.pipe(takeUntil(this.unsubscribe)).subscribe(data => {
        if (this.isMobileOrTab && data === 'close') {
          this.mobileViewDisplay = 'block';
        }
      });
    }
  
    /**
     * loadPlayer method will be called
     */
    ngAfterViewInit() {
      if (this.playerConfig) {
        this.loadPlayer();
      }
    }
  
    ngOnChanges(changes) {
      this.contentRatingModal = false;
      this.showNewPlayer = false;
      this.cdr.detectChanges();
      if (this.playerConfig) {
        this.playerOverlayImage = this.overlayImagePath ? this.overlayImagePath : _.get(this.playerConfig, 'metadata.appIcon');
        this.loadPlayer();
      }
    }
    loadCdnPlayer() {
      const iFrameSrc = this.config.getconfigService().appConfig.PLAYER_CONFIG.cdnUrl + '&build_number=' + this.buildNumber;
      setTimeout(() => {
        const playerElement = this.contentIframe.nativeElement;
        playerElement.src = iFrameSrc;
        playerElement.onload = (event) => {
          try {
            this.adjustPlayerHeight();
            playerElement.contentWindow.initializePreview(this.playerConfig);
            if (this.playerLoaded) {
              playerElement.removeEventListener('renderer:telemetry:event', telemetryEvent => this.generateContentReadEvent(telemetryEvent));
              window.frames['contentPlayer'].removeEventListener('message', accessEvent => this.generateScoreSubmitEvent(accessEvent), false);
            }
            this.playerLoaded = true;
            playerElement.addEventListener('renderer:telemetry:event', telemetryEvent => this.generateContentReadEvent(telemetryEvent));
            window.frames['contentPlayer'].addEventListener('message', accessEvent => this.generateScoreSubmitEvent(accessEvent), false);
          } catch (err) {
            this.loadDefaultPlayer();
          }
        };
      }, 0);
    }
    loadDefaultPlayer(url = this.config.getconfigService().appConfig.PLAYER_CONFIG.baseURL) {
      const iFrameSrc = url + '&build_number=' + this.buildNumber;
      setTimeout(() => {
        const playerElement = this.contentIframe.nativeElement;
        playerElement.src = iFrameSrc;
        playerElement.onload = (event) => {
          try {
            this.adjustPlayerHeight();
            playerElement.contentWindow.initializePreview(this.playerConfig);
            if (this.playerLoaded) {
              playerElement.removeEventListener('renderer:telemetry:event', telemetryEvent => this.generateContentReadEvent(telemetryEvent));
              window.frames['contentPlayer'].removeEventListener('message', accessEvent => this.generateScoreSubmitEvent(accessEvent), false);
            }
            this.playerLoaded = true;
            playerElement.addEventListener('renderer:telemetry:event', telemetryEvent => this.generateContentReadEvent(telemetryEvent));
            window.frames['contentPlayer'].addEventListener('message', accessEvent => this.generateScoreSubmitEvent(accessEvent), false);
          } catch (err) {
            const prevUrls = this.config.getnavigationHelperService().history;
            if (this.isCdnWorking.toLowerCase() === 'yes' && prevUrls[prevUrls.length - 2]) {
              history.back();
            }
          }
        };
      }, 0);
    }
  
    loadPlayer() {
      this.checkForQumlPlayer();
      this.playerType = null;
      const formReadInputParams = {
        formType: 'content',
        formAction: 'play',
        contentType: 'player'
      };
      this.config.getformService().getFormConfig(formReadInputParams).subscribe(
        (data: any) => {
          let isNewPlayer = false;
          _.forEach(data, (value) => {
            if (_.includes(_.get(value, 'mimeType'), _.get(this.playerConfig, 'metadata.mimeType')) && _.get(value, 'version') === 2) {
              this.playerConfig.context.threshold = _.get(value, 'threshold');
              this.playerType = _.get(value, 'type');
              isNewPlayer = true;
            }
          });
          if (isNewPlayer) {
            this.playerLoaded = false;
            this.loadNewPlayer();
          } else {
            this.loadOldPlayer();
          }
        },
        (error) => {
          this.loadOldPlayer();
        }
      );
    }
  
    checkForQumlPlayer() {
      if (_.get(this.playerConfig, 'metadata.mimeType') === this.config.getconfigService().appConfig.PLAYER_CONFIG.MIME_TYPE.questionset) {
        this.playerConfig.config.sideMenu.showDownload = false;
        if (!_.get(this.playerConfig, 'metadata.instructions')) {
          this.config.getpublicPlayerService().getQuestionSetRead(_.get(this.playerConfig, 'metadata.identifier')).subscribe((data: any) => {
            this.playerConfig.metadata.instructions = _.get(data, 'result.questionset.instructions');
            this.showQumlPlayer = true;
          }, (error) => {
            this.showQumlPlayer = true;
          });
        } else {
          this.showQumlPlayer = true;
        }
      }
    }
  
    loadOldPlayer() {
      this.showNewPlayer = false;
      if (this.isDesktopApp) {
        this.updateMetadataForDesktop();
        const downloadStatus = Boolean(_.get(this.playerConfig, 'metadata.desktopAppMetadata.isAvailable'));
        let playerUrl = this.config.getconfigService().appConfig.PLAYER_CONFIG.localBaseUrl;
        if (!downloadStatus) {
          playerUrl = `${playerUrl}webview=true`;
        }
        this.loadDefaultPlayer(playerUrl);
        return;
      }
      if (this.isMobileOrTab) {
        this.rotatePlayer();
      }
      if (this.previewCdnUrl !== '' && (this.isCdnWorking).toLowerCase() === 'yes') {
        this.loadCdnPlayer();
        return;
      }
  
      this.loadDefaultPlayer();
    }
  
    loadNewPlayer() {
      const downloadStatus = Boolean(_.get(this.playerConfig, 'metadata.desktopAppMetadata.isAvailable'));
      const artifactUrl = _.get(this.playerConfig, 'metadata.artifactUrl');
      this.contentId = _.get(this.playerConfig, 'metadata.identifier');
      this.collectionId = _.get(this.playerConfig, 'context.objectRollup.l1');
      if (downloadStatus && artifactUrl && !_.startsWith(artifactUrl, 'http://')) {
        this.playerConfig.metadata.artifactUrl = `${location.origin}/${artifactUrl}`;
      }
      this.addUserDataToContext();
      if (this.isMobileOrTab) {
        this.isFullScreenView = true;
        if (_.get(this.playerConfig, 'metadata.mimeType') !== this.config.getconfigService().appConfig.PLAYER_CONFIG.MIME_TYPE.questionset) {
          this.rotatePlayer();
        }
      }
      this.showNewPlayer = true;
      if (this.config.getuserService().loggedIn) {
        this.config.getuserService().userData$.subscribe((user: any) => {
          if (user && !user.err) {
            const userProfile = user.userProfile;
            const userId = userProfile.id;
            const varName = (userId + '_' + (this.collectionId ? this.collectionId : '') + '_' + (this.contentId ? this.contentId : '') + '_config');
            const playerConfig: any = JSON.parse(localStorage.getItem(varName)) || {};
            this.playerConfig['config'] = { ...this.playerConfig['config'], ...playerConfig };
          }
        });
      } else {
        const varName = ('guest' + '_' + (this.collectionId ? this.collectionId : '') + '_' + (this.contentId ? this.contentId : '') + '_config');;
        const playerConfig: any = JSON.parse(localStorage.getItem(varName)) || {};
        this.playerConfig['config'] = { ...this.playerConfig['config'], ...playerConfig };
      }
    }
  
    // Update ArtifactUrl for old Player
    updateMetadataForDesktop() {
      const downloadStatus = Boolean(_.get(this.playerConfig, 'metadata.desktopAppMetadata.isAvailable'));
      if (downloadStatus) {
        this.playerConfig.data = '';
        if (_.get(this.playerConfig, 'metadata.artifactUrl')
          && _.includes(OFFLINE_ARTIFACT_MIME_TYPES, this.playerConfig.metadata.mimeType)) {
          const artifactFileName = this.playerConfig.metadata.artifactUrl.split('/');
          this.playerConfig.metadata.artifactUrl = artifactFileName[artifactFileName.length - 1];
        }
      }
    }
  
    /**
     * Adjust player height after load
     */
    adjustPlayerHeight() {
      const playerWidth = $('#contentPlayer').width();
      if (playerWidth) {
        let height = playerWidth * (9 / 16);
        if (_.get(screen, 'orientation.type') === 'landscape-primary' && this.isMobileOrTab) {
          height = window.innerHeight;
        }
        $('#contentPlayer').css('height', height + 'px');
      }
    }
  
    generateScoreSubmitEvent(event: any) {
      if (event.data.toLowerCase() === (this.CONSTANT.ACCESSEVENT).toLowerCase()) {
        this.questionScoreSubmitEvents.emit(event);
      }
      if (event.data.toLowerCase() === (this.CONSTANT.ISLASTATTEMPT).toLowerCase()) {
        this.selfAssessLastAttempt.emit(event);
      }
      if (event.data.toLowerCase() === (this.CONSTANT.MAXATTEMPT).toLowerCase()) {
        this.selfAssessLastAttempt.emit(event);
      }
      if (event.data.toLowerCase() === (this.CONSTANT.ACCESSREVIEWEVENT).toLowerCase()) {
        this.questionScoreReviewEvents.emit(event);
      }
    }
  
    generatelimitedAttemptEvent(event) {
      if (_.get(event, 'edata.isLastAttempt')) {
        this.selfAssessLastAttempt.emit(event);
      } else if (_.get(event, 'edata.maxLimitExceeded')) {
        this.selfAssessLastAttempt.emit(event);
      }
    }
  
    eventHandler(event) {
      if (event.eid === 'END') {
        const metaDataconfig = event.metaData;
        if (this.config.getuserService().loggedIn) {
          this.config.getuserService().userData$.subscribe((user: any) => {
            if (user && !user.err) {
              const userProfile = user.userProfile;
              const userId = userProfile.id;
              const varName = (userId + '_' + (this.collectionId ? this.collectionId : '') + '_' + (this.contentId ? this.contentId : '') + '_config');
              localStorage.setItem(varName, JSON.stringify(metaDataconfig));
            }
          });
        } else {
          const userId = 'guest';
          const varName = (userId + '_' + (this.collectionId ? this.collectionId : '') + '_' + (this.contentId ? this.contentId : '') + '_config');
          localStorage.setItem(varName, JSON.stringify(metaDataconfig));
        }
      }
      if (event.eid === 'exdata') {
        this.generatelimitedAttemptEvent(event);
        return;
      }
      if (_.get(event, 'edata.type') === 'SHARE') {
        this.config.getcontentUtilsServiceService().contentShareEvent.emit('open');
        this.mobileViewDisplay = 'none';
      }
      if (_.get(event, 'edata.type') === 'PRINT') {
        const windowFrame = window.document.querySelector('pdf-viewer iframe');
        if (windowFrame) {
          windowFrame['contentWindow'].print();
        }
        this.mobileViewDisplay = 'none';
      }
    }
  
    generateContentReadEvent(event: any, newPlayerEvent?) {
      let eventCopy = newPlayerEvent ? _.cloneDeep(event) : event;
      if (!eventCopy) {
        return;
      }
      if (newPlayerEvent) {
        eventCopy = { detail: {telemetryData: eventCopy}};
      }
      const eid = _.get(eventCopy, 'detail.telemetryData.eid');
      const contentId = _.get(eventCopy, 'detail.telemetryData.object.id');
      // this.contentId = contentId;
      if (eid && (eid === 'START' || eid === 'END') && contentId === _.get(this.playerConfig, 'metadata.identifier')) {
        this.showRatingPopup(eventCopy);
        if (this.contentProgressEvents$) {
          this.contentProgressEvents$.next(eventCopy);
        }
      } else if (eid && (eid === 'IMPRESSION')) {
        this.emitSceneChangeEvent();
      }
      if (eid && (eid === 'ASSESS') || eid === 'START' || eid === 'END') {
        this.assessmentEvents.emit(eventCopy);
      }
  
      if (_.get(this.playerConfig, 'metadata.mimeType') === this.config.getconfigService().appConfig.PLAYER_CONFIG.MIME_TYPE.questionset && eid === 'END') {
        this.questionScoreSubmitEvents.emit(event);
      }
    }
    emitSceneChangeEvent(timer = 0) {
      setTimeout(() => {
        if (_.get(this, 'contentIframe.nativeElement')) {
          const stageId = this.contentIframe.nativeElement.contentWindow.EkstepRendererAPI.getCurrentStageId();
          const eventData = { stageId };
          this.sceneChangeEvent.emit(eventData);
        }
      }, timer); // waiting for player to load, then fetching stageId (if we dont wait stageId will be undefined)
    }
  
    showRatingPopup(event) {
      let contentProgress;
      const playerSummary: Array<any> = _.get(event, 'detail.telemetryData.edata.summary');
      if (playerSummary) {
        const contentMimeType = this.playerConfig.metadata.mimeType;
        contentProgress = CsContentProgressCalculator.calculate(playerSummary, contentMimeType);
      }
      if (event.detail.telemetryData.eid === 'END' && contentProgress === 100) {
        this.contentRatingModal = !this.isFullScreenView;
        this.showRatingModalAfterClose = true;
        if (this.modal) {
          this.modal.showContentRatingModal = true;
        }
      }
    }
  
    /**
     * this method will handle play button click and turn the player into landscape
     */
    enablePlayer(mode: boolean) {
      this.showPlayIcon = mode;
      this.loadPlayer();
    }
  
    /** this method checks for the browser capability to be fullscreen via if-else ladder
     * if match found, it will turn the player along will be close button into fullscreen and then
     * rotate it to landscape mode
     */
    rotatePlayer() {
      setTimeout(() => {
        const playVideo: any = document.querySelector('#playerFullscreen');
        try {
          if (playVideo.requestFullscreen) {
            playVideo.requestFullscreen();
          } else if (playVideo.mozRequestFullScreen) { /* Firefox */
            playVideo.mozRequestFullScreen();
          } else if (playVideo.webkitRequestFullscreen) { /* Chrome, Safari and Opera */
            playVideo.webkitRequestFullscreen();
          } else if (playVideo.msRequestFullscreen) { /* IE/Edge */
            playVideo.msRequestFullscreen();
          }
          screen.orientation.lock('landscape');
        } catch (error) {}
      });
    }
  
    /** when user clicks on close button
     * this method will let the player to exit from fullscreen mode and
     * 1. video thumbnail will be shown for single content
     * 2. content-details page will be shown ( for multi-result dial-code search flow)
     */
    closeFullscreen() {
      /** to exit the fullscreen mode */
      if (document['exitFullscreen']) {
        document['exitFullscreen']();
      } else if (document['mozCancelFullScreen']) { /* Firefox */
        document['mozCancelFullScreen']();
      } else if (document['webkitExitFullscreen']) { /* Chrome, Safari and Opera */
        document['webkitExitFullscreen']();
      } else if (document['msExitFullscreen']) { /* IE/Edge */
        document['msExitFullscreen']();
      }
  
      if (this.showRatingModalAfterClose) {
        this.contentRatingModal = true;
        if (this.modal) {
          this.modal.showContentRatingModal = true;
        }
      }
       /** to change the view of the content-details page */
      this.showPlayIcon = true;
      this.closePlayerEvent.emit();
    }
  
    setTelemetryData() {
      this.closeButtonInteractEdata = {
        id: 'player-close-button',
        type: 'click',
        pageid: this.pageId
      };
  
      this.loadPlayerInteractEdata = {
        id: 'play-button',
        type: 'click',
        pageid: this.pageId
      };
    }
  
    closeContentFullScreen() {
      this.config.getnavigationHelperService().emitFullScreenEvent(false);
      this.loadPlayer();
    }
  
    closeModal() {
      this.focusOnReplay();
      this.ratingPopupClose.emit({});
    }
    
    focusOnReplay() {
      if (this.playerType === 'quml-player') {
        const replayButton: HTMLElement = document.querySelector('.replay-section');
        if (replayButton) {
          replayButton.focus();
        }
      }
    }
    
    public addUserDataToContext() {
      if (this.config.getuserService().loggedIn) {
        this.config.getuserService().userData$.subscribe((user: any) => {
          if (user && !user.err) {
            const userProfile = user.userProfile;
            this.playerConfig.context['userData'] = {
              firstName: userProfile.firstName ? userProfile.firstName : 'Guest',
              lastName: userProfile.lastName ? userProfile.lastName : ''
            };
          }
        });
      } else {
        this.playerConfig.context.userData = {
          firstName: this.config.getuserService().guestUserProfile.formatedName || 'Guest',
          lastName: ''
        };
      }
    }
  
    ngOnDestroy() {
      const playerElement = _.get(this.contentIframe, 'nativeElement');
      if (playerElement) {
        if (_.get(playerElement, 'contentWindow.telemetry_web.tList.length')) {
          const request = {
            url: this.config.getconfigService().urlConFig.URLS.TELEMETRY.SYNC,
            data: {
              'id': 'api.sunbird.telemetry',
              'ver': '3.0',
              'events': playerElement.contentWindow.telemetry_web.tList.map((item: string) => JSON.parse(item))
            }
          };
          this.config.getcontentService().post(request).subscribe();
        }
        playerElement.remove();
      }
      this.unsubscribe.next();
      this.unsubscribe.complete();
    }
  }
  