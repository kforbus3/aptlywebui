function app() {
  return {
    // Data stores
    mirrors: [],
    repos: [],
    snapshots: [],
    publishList: [],
    graphSvg: '',
    gpgKeys: [],
    allPackages: [],
    csrfToken: '',

    // Navigation
    tab: 'mirrors',
    tabs: [
      {id:'mirrors', label:'Mirrors'},
      {id:'repos', label:'Local Repos'},
      {id:'snapshots', label:'Snapshots'},
      {id:'publish', label:'Publish'},
      {id:'packages', label:'Packages'}
    ],

    // Modals
    activeModal: '',
    resultText: '',
    resultError: false,

    // Filters
    filterMirrors: '',
    filterRepos: '',
    filterSnapshots: '',
    filterPublish: '',
    snapshotTimeRange: 'all',
    snapshotSort: 'newest',
    filterPackages: '',
    packageSearchMode: 'published',
    selectedPackagePublish: '',

    // Pagination
    pageMirrors: 1, pageRepos: 1, pageSnapshots: 1, pagePublish: 1, pagePackages: 1,
    pageSize: 15,

    // Mirror forms
    commonArchitectures: ['amd64','i386','arm64','armhf','all','source'],
    componentOptions: ['main','contrib','non-free','restricted','universe','multiverse'],
    formMirror: {
      Name:'', preset:'custom', ubuntuRelease:'noble', ubuntuPocket:'release', ArchiveURL:'', Distribution:'', Components:[], Architectures:[],
      Filter:'', FilterWithDeps:false, DownloadUris:false, SkipComponentCheck:false, esmToken:''
    },
    presetMap: {
      custom:{components:['main'],url:'',dist:''},
      debian:{components:['main','contrib','non-free'],url:'https://deb.debian.org/debian',dist:'bookworm'},
      ubuntu_release:{components:['main','multiverse','restricted','universe'],url:'https://archive.ubuntu.com/ubuntu',dist:'noble'},
      ubuntu_security:{components:['main','multiverse','restricted','universe'],url:'https://security.ubuntu.com/ubuntu',dist:'noble-security'},
      ubuntu_updates:{components:['main','multiverse','restricted','universe'],url:'https://archive.ubuntu.com/ubuntu',dist:'noble-updates'},
      ubuntu_backports:{components:['main','multiverse','restricted','universe'],url:'https://archive.ubuntu.com/ubuntu',dist:'noble-backports'},
      ubuntu_proposed:{components:['main','multiverse','restricted','universe'],url:'https://archive.ubuntu.com/ubuntu',dist:'noble-proposed'},
      ubuntu_esm_infra:{components:['main'],url:'https://esm.ubuntu.com/infra/ubuntu',dist:'noble-infra-security'},
      ubuntu_esm_apps:{components:['main'],url:'https://esm.ubuntu.com/apps/ubuntu',dist:'noble-apps-security'},
    },

    // Repo form
    formRepo: {Name:'', Comment:'', DefaultDistribution:'', DefaultComponent:''},

    // Snapshot form
    formSnapshot: {Name:'', Description:'', sourceType:'', sourceName:'', sourceComponent:'main', selectedSnapshots: []},

    // Publish form
    formPublish: {Prefix:'', Distribution:'', sourceType:'', Architectures:'', signKeyId:'', selectedSources: []},

    // Upload
    uploadTargetRepo: '',
    selectedFiles: [],
    uploadProgress: 0,
    uploadStatus: '',
    uploading: false,

    // GPG upload
    gpgUploadProgress: 0,
    gpgUploading: false,

    // Switch
    switchTarget: null,
    formSwitch: {snapshotName:'', ForceOverwrite:false},

    // Tasks & notifications
    tasks: [],
    toasts: [],
    viewPackagesName: '',
    viewPackagesList: [],

    get filteredMirrors() {
      const q = this.filterMirrors.toLowerCase();
      if (!q) return this.mirrors;
      return this.mirrors.filter(m => (m.Name + ' ' + m.ArchiveURL + ' ' + m.Distribution).toLowerCase().includes(q));
    },
    watchFilterMirrors() { this.pageMirrors = 1; },
    get paginatedMirrors() {
      const list = this.filteredMirrors;
      const start = (this.pageMirrors - 1) * this.pageSize;
      return list.slice(start, start + this.pageSize);
    },

    get filteredRepos() {
      const q = this.filterRepos.toLowerCase();
      if (!q) return this.repos;
      return this.repos.filter(r => (r.Name + ' ' + r.Comment + ' ' + r.DefaultDistribution).toLowerCase().includes(q));
    },
    watchFilterRepos() { this.pageRepos = 1; },
    get paginatedRepos() {
      const start = (this.pageRepos - 1) * this.pageSize;
      return this.filteredRepos.slice(start, start + this.pageSize);
    },

    get snapshotTimeCutoff() {
      const now = Date.now();
      const ranges = { day: 86400000, week: 604800000, month: 2629800000, year: 31557600000 };
      return now - (ranges[this.snapshotTimeRange] || Infinity);
    },
    get filteredSnapshots() {
      let list = this.snapshots.slice();
      const q = this.filterSnapshots.toLowerCase();
      if (q) list = list.filter(s => (s.Name + ' ' + (s.Description||'')).toLowerCase().includes(q));
      if (this.snapshotTimeRange !== 'all') {
        const minTime = this.snapshotTimeCutoff;
        list = list.filter(s => s.CreatedAt && new Date(s.CreatedAt).getTime() >= minTime);
      }
      // Sort
      const dir = this.snapshotSort.startsWith('oldest') ? 1 : -1;
      if (this.snapshotSort === 'name') {
        list.sort((a,b) => a.Name.localeCompare(b.Name));
      } else {
        list.sort((a,b) => {
          const ta = a.CreatedAt ? new Date(a.CreatedAt).getTime() : 0;
          const tb = b.CreatedAt ? new Date(b.CreatedAt).getTime() : 0;
          return dir * (tb - ta);
        });
      }
      return list;
    },
    watchFilterSnapshots() { this.pageSnapshots = 1; },
    get paginatedSnapshots() {
      const start = (this.pageSnapshots - 1) * this.pageSize;
      return this.filteredSnapshots.slice(start, start + this.pageSize);
    },

    get filteredPublish() {
      const q = this.filterPublish.toLowerCase();
      if (!q) return this.publishList;
      return this.publishList.filter(p => ((p.Prefix||'(root)') + ' ' + p.Distribution + ' ' + p.SourceKind).toLowerCase().includes(q));
    },
    watchFilterPublish() { this.pagePublish = 1; },
    get paginatedPublish() {
      const start = (this.pagePublish - 1) * this.pageSize;
      return this.filteredPublish.slice(start, start + this.pageSize);
    },

    get filteredPackages() {
      let list = this.allPackages;
      const q = this.filterPackages.toLowerCase();
      if (q) list = list.filter(p => (p.name + ' ' + p.version + ' ' + p.architecture).toLowerCase().includes(q));
      if (this.packageSearchMode === 'published' && this.selectedPackagePublish) {
        list = list.filter(p => p.publish === this.selectedPackagePublish);
      }
      return list;
    },
    watchFilterPackages() { this.pagePackages = 1; },
    get paginatedPackages() {
      const start = (this.pagePackages - 1) * this.pageSize;
      return this.filteredPackages.slice(start, start + this.pageSize);
    },

    pageCount(list) {
      return Math.max(1, Math.ceil((list||[]).length / this.pageSize));
    },

    async init() {
      try {
        const auth = await fetch('/api/auth/verify');
        if (auth.status === 401) {
          this.showToast('Authentication required. Please reload and enter credentials.', 'error');
          return;
        }
        const authData = await auth.json();
        if (authData.csrf_token) this.csrfToken = authData.csrf_token;
      } catch (e) {
        this.showToast('Failed to initialize auth: ' + e.message, 'error');
        return;
      }
      await Promise.all([this.loadMirrors(), this.loadRepos(), this.loadSnapshots(), this.loadPublish(), this.loadGpgKeys()]);
      this.loadGraph();
    },

    async api(method, endpoint, body, isForm) {
      const opts = {method};
      const headers = {};
      if (this.csrfToken) headers['X-CSRFToken'] = this.csrfToken;
      if (isForm) {
        opts.body = body;
        // Let browser set Content-Type for FormData
      } else if (body) {
        headers['Content-Type'] = 'application/json';
        opts.body = JSON.stringify(body);
      }
      if (Object.keys(headers).length) opts.headers = headers;
      try {
        const resp = await fetch('/api' + endpoint, opts);
        if (resp.status === 401) {
          this.showToast('Unauthorized — please reload and log in.', 'error');
          return {error: 'Unauthorized'};
        }
        if (resp.status === 403) {
          this.showToast('Forbidden — CSRF token missing or invalid. Reload the page.', 'error');
          return {error: 'CSRF validation failed'};
        }
        return await resp.json();
      } catch(e) {
        this.showToast((method + ' ' + endpoint + ' failed: ' + e.message), 'error');
        return {error: e.message};
      }
    },

    async get(e) { return this.api('GET', e); },
    async post(e, b) { return this.api('POST', e, b); },
    async put(e, b) { return this.api('PUT', e, b); },
    async patch(e, b) { return this.api('PATCH', e, b); },
    async del(e) { return this.api('DELETE', e); },
    async postForm(e, fd) { return this.api('POST', e, fd, true); },

    async loadMirrors() {
      const data = await this.get('/mirrors');
      this.mirrors = Array.isArray(data) ? data : [];
      this.pageMirrors = Math.min(this.pageMirrors, this.pageCount(this.mirrors));
    },
    async loadRepos() {
      const data = await this.get('/repos');
      this.repos = Array.isArray(data) ? data : [];
      this.pageRepos = Math.min(this.pageRepos, this.pageCount(this.repos));
    },
    async loadSnapshots() {
      const data = await this.get('/snapshots');
      this.snapshots = Array.isArray(data) ? data : [];
      this.pageSnapshots = Math.min(this.pageSnapshots, this.pageCount(this.snapshots));
    },
    async loadPublish() {
      const data = await this.get('/publish');
      this.publishList = Array.isArray(data) ? data : [];
      this.pagePublish = Math.min(this.pagePublish, this.pageCount(this.publishList));
    },
    async loadGraph() {
      try {
        const resp = await fetch('/api/graph');
        if (resp.ok) {
          const blob = await resp.blob();
          if (this.graphSvg) URL.revokeObjectURL(this.graphSvg);
          this.graphSvg = URL.createObjectURL(blob);
        }
      } catch(e) {}
    },
    async loadGpgKeys() {
      const data = await this.get('/gpg/keys');
      this.gpgKeys = Array.isArray(data) ? data : [];
    },

    openModal(name) {
      this.activeModal = name;
      if (name === 'createMirror') {
        this.formMirror = {Name:'', preset:'custom', ubuntuRelease:'noble', ubuntuPocket:'release', ArchiveURL:'', Distribution:'', Components:[], Architectures:[], Filter:'', FilterWithDeps:false, DownloadUris:false, SkipComponentCheck:false, esmToken:''};
        this.componentOptions = ['main','contrib','non-free','restricted','universe','multiverse'];
      }
      if (name === 'createRepo') { this.formRepo = {Name:'', Comment:'', DefaultDistribution:'', DefaultComponent:''}; }
      if (name === 'createSnapshot') { this.formSnapshot = {Name:'', Description:'', sourceType:'', sourceName:'', sourceComponent:'main', selectedSnapshots: []}; }
      if (name === 'publishSnapshot') { this.formPublish = {Prefix:'', Distribution:'', sourceType:'', Architectures:'', signKeyId:'', selectedSources: []}; }
    },
    closeModal() { this.activeModal = ''; },
    setTab(name) {
      this.tab = name;
      if (name === 'packages' && this.allPackages.length === 0) this.loadPackages();
    },
    parseAptlyPackage(key) {
      const s = (key || '').trim();
      if (s && s[0] === 'P') {
        const rest = s.substring(1);
        const firstSpace = rest.indexOf(' ');
        if (firstSpace !== -1) {
          const arch = rest.substring(0, firstSpace);
          const afterArch = rest.substring(firstSpace + 1).trim();
          const secondSpace = afterArch.indexOf(' ');
          if (secondSpace !== -1) {
            return { name: afterArch.substring(0, secondSpace), version: afterArch.substring(secondSpace + 1).trim(), architecture: arch };
          }
          return { name: afterArch, version: '', architecture: arch };
        }
      }
      return { name: s, version: '', architecture: '' };
    },
    modalTitle() {
      const t = {
        createMirror:'Create Mirror', editMirror:'Edit Mirror',
        createRepo:'Create Local Repo', uploadRepo:'Upload Packages',
        createSnapshot:'Create Snapshot', publishSnapshot:'Publish Snapshot',
        updatePublish:'Update Publish', switchPublish:'Switch Published Snapshot',
        gpgKeys:'GPG Signing Keys',
        viewPackages:'Packages', result:'Result'
      };
      return t[this.activeModal] || '';
    },
    showToast(msg, type='success') {
      const id = Date.now(); this.toasts.push({id, message: msg, type});
      setTimeout(() => { this.toasts = this.toasts.filter(t => t.id !== id); }, 4000);
    },
    showResult(data, error=false) {
      this.resultError = error;
      this.resultText = JSON.stringify(data, null, 2);
      this.activeModal = 'result';
    },

    watchPreset() {
      if (this.formMirror.preset === 'custom') {
        this.componentOptions = ['main','contrib','non-free','restricted','universe','multiverse']; return;
      }
      const r = this.formMirror.ubuntuRelease || 'noble';
      const pocket = this.formMirror.ubuntuPocket || 'release';
      if (this.formMirror.preset === 'ubuntu') {
        this.formMirror.ArchiveURL = pocket === 'security' ? 'https://security.ubuntu.com/ubuntu' : 'https://archive.ubuntu.com/ubuntu';
        this.formMirror.Distribution = r + (pocket === 'release' ? '' : '-' + pocket);
        this.formMirror.Components = ['main','multiverse','restricted','universe'];
        this.componentOptions = ['main','restricted','universe','multiverse'];
      } else if (this.formMirror.preset === 'ubuntu_esm_infra') {
        this.formMirror.ArchiveURL = 'https://esm.ubuntu.com/infra/ubuntu';
        this.formMirror.Distribution = r + '-infra-security';
        this.formMirror.Components = ['main'];
        this.componentOptions = ['main'];
      } else if (this.formMirror.preset === 'ubuntu_esm_apps') {
        this.formMirror.ArchiveURL = 'https://esm.ubuntu.com/apps/ubuntu';
        this.formMirror.Distribution = r + '-apps-security';
        this.formMirror.Components = ['main'];
        this.componentOptions = ['main'];
      } else if (this.formMirror.preset === 'debian') {
        this.formMirror.ArchiveURL = 'https://deb.debian.org/debian';
        this.formMirror.Distribution = 'bookworm';
        this.formMirror.Components = ['main','contrib','non-free'];
        this.componentOptions = ['main','contrib','non-free'];
      }
    },
    urlPlaceholder() {
      if (this.formMirror.preset === 'custom') return 'https://deb.debian.org/debian';
      if (this.formMirror.preset === 'ubuntu') {
        const p = this.formMirror.ubuntuPocket || 'release';
        return p === 'security' ? 'https://security.ubuntu.com/ubuntu' : 'https://archive.ubuntu.com/ubuntu';
      }
      if (this.formMirror.preset === 'ubuntu_esm_infra') return 'https://esm.ubuntu.com/infra/ubuntu';
      if (this.formMirror.preset === 'ubuntu_esm_apps') return 'https://esm.ubuntu.com/apps/ubuntu';
      return (this.presetMap[this.formMirror.preset]||{}).url || '';
    },
    distPlaceholder() {
      if (this.formMirror.preset === 'custom') return 'bookworm';
      if (this.formMirror.preset === 'ubuntu') {
        const r = this.formMirror.ubuntuRelease || 'noble';
        const p = this.formMirror.ubuntuPocket || 'release';
        return r + (p === 'release' ? '' : '-' + p);
      }
      if (this.formMirror.preset === 'ubuntu_esm_infra') return (this.formMirror.ubuntuRelease || 'noble') + '-infra-security';
      if (this.formMirror.preset === 'ubuntu_esm_apps') return (this.formMirror.ubuntuRelease || 'noble') + '-apps-security';
      return (this.presetMap[this.formMirror.preset]||{}).dist || '';
    },

    buildMirrorPayload() {
      let url = this.formMirror.ArchiveURL.trim();
      if (this.formMirror.preset.startsWith('ubuntu_esm') && this.formMirror.esmToken) {
        const t = encodeURIComponent(this.formMirror.esmToken.trim());
        url = url.replace('https://', 'https://' + t + ':' + t + '@');
      }
      return {
        Name: this.formMirror.Name.trim(), ArchiveURL: url,
        Distribution: this.formMirror.Distribution.trim(),
        Components: this.formMirror.Components, Architectures: this.formMirror.Architectures,
        Filter: (this.formMirror.Filter||'').trim(),
        FilterWithDeps: this.formMirror.FilterWithDeps, DownloadUris: this.formMirror.DownloadUris, SkipComponentCheck: this.formMirror.SkipComponentCheck
      };
    },

    async doCreateMirror() {
      const data = await this.post('/mirrors', this.buildMirrorPayload());
      if (data.error) this.showResult(data, true); else { this.showToast('Mirror created'); this.closeModal(); this.loadMirrors(); }
    },
    async doUpdateMirror() {
      const data = await this.put('/mirrors/' + encodeURIComponent(this.formMirror.Name), this.buildMirrorPayload());
      if (data.error) this.showResult(data, true); else { this.showToast('Mirror updated'); this.closeModal(); this.loadMirrors(); }
    },
    async updateMirrorPackages(name) {
      this.showToast('Updating ' + name + '...');
      const data = await this.post('/mirrors/' + encodeURIComponent(name) + '/update', {});
      if (data.error) { this.showResult(data, true); return; }
      if (data.ID !== undefined) this.pollTask(data.ID, 'Update ' + name); else this.showToast('Mirror updated');
      this.loadMirrors();
    },
    editMirror(m) {
      this.formMirror = {
        Name: m.Name, preset: 'custom', ubuntuRelease:'noble', ubuntuPocket: 'release',
        ArchiveURL: m.ArchiveURL||'', Distribution: m.Distribution||'',
        Components: (m.Components||[]).slice(), Architectures: (m.Architectures||[]).slice(),
        Filter: m.Filter||'', FilterWithDeps: m.FilterWithDeps||false,
        DownloadUris: m.DownloadUris||false, SkipComponentCheck: m.SkipComponentCheck||false, esmToken: ''
      };
      this.activeModal = 'editMirror';
    },
    async dropMirror(name) {
      if (!confirm('Drop mirror ' + name + '?')) return;
      const data = await this.del('/mirrors/' + encodeURIComponent(name) + '?force=1');
      if (data.error) this.showResult(data, true); else { this.showToast('Mirror dropped'); this.loadMirrors(); }
    },

    async doCreateRepo() {
      const payload = { Name: this.formRepo.Name.trim(), Comment: this.formRepo.Comment.trim(), DefaultDistribution: this.formRepo.DefaultDistribution.trim(), DefaultComponent: this.formRepo.DefaultComponent.trim() };
      const data = await this.post('/repos', payload);
      if (data.error) this.showResult(data, true); else { this.showToast('Repo created'); this.closeModal(); this.loadRepos(); }
    },
    async deleteRepo(name) {
      if (!confirm('Delete repo ' + name + '?')) return;
      const data = await this.del('/repos/' + encodeURIComponent(name));
      if (data.error) this.showResult(data, true); else { this.showToast('Repo deleted'); this.loadRepos(); }
    },

    openUploadModal(repoName) { this.uploadTargetRepo = repoName; this.selectedFiles = []; this.uploadProgress = 0; this.uploadStatus = ''; this.uploading = false; this.activeModal = 'uploadRepo'; },
    handleFiles(ev) { this.selectedFiles = Array.from(ev.target.files); },
    async doUpload() {
      if (!this.selectedFiles.length) return;
      this.uploading = true; this.uploadProgress = 10; this.uploadStatus = 'Uploading...';
      const fd = new FormData(); this.selectedFiles.forEach(f => fd.append('file', f));
      const up = await this.postForm('/files', fd);
      if (up.error) { this.showResult(up, true); this.uploading = false; return; }
      this.uploadProgress = 60; this.uploadStatus = 'Adding to repository...';
      const data = await this.post('/repos/' + encodeURIComponent(this.uploadTargetRepo) + '/add', { ForceReplace: true, FileRefs: Array.isArray(up) ? up : [] });
      if (data.error) this.showResult(data, true); else this.showToast('Packages uploaded');
      this.uploadProgress = 100; this.uploadStatus = 'Done'; this.uploading = false;
      setTimeout(() => this.closeModal(), 800); this.loadRepos();
    },

    async viewRepoPackages(name) {
      const data = await this.get('/repos/' + encodeURIComponent(name) + '/packages');
      this.viewPackagesName = name; this.viewPackagesList = Array.isArray(data) ? data : []; this.activeModal = 'viewPackages';
    },

    async doCreateSnapshot() {
      const { Name, Description, sourceType, sourceName } = this.formSnapshot;
      const payload = { Name: Name.trim(), Description: Description.trim() };
      if (sourceType === 'mirror') {
        if (!sourceName) { this.showToast('Select a mirror', 'error'); return; }
        const data = await this.post('/snapshots/from-mirror/' + encodeURIComponent(sourceName), payload);
        if (data.error) { this.showResult(data, true); return; }
      } else if (sourceType === 'repo') {
        if (!sourceName) { this.showToast('Select a repo', 'error'); return; }
        const data = await this.post('/snapshots/from-repo/' + encodeURIComponent(sourceName), payload);
        if (data.error) { this.showResult(data, true); return; }
      } else if (sourceType === 'snapshot') {
        const selected = this.formSnapshot.selectedSnapshots || [];
        if (!selected.length) { this.showToast('Select at least one snapshot', 'error'); return; }
        payload.SourceSnapshots = selected.map(name => ({Component: (this.formSnapshot.sourceComponent || 'main'), Name: name}));
        const data = await this.post('/snapshots', payload);
        if (data.error) { this.showResult(data, true); return; }
      } else {
        const data = await this.post('/snapshots', payload);
        if (data.error) { this.showResult(data, true); return; }
      }
      this.showToast('Snapshot created'); this.closeModal(); this.loadSnapshots();
    },
    async deleteSnapshot(name) {
      if (!confirm('Delete snapshot ' + name + '?')) return;
      const data = await this.del('/snapshots/' + encodeURIComponent(name) + '?force=1');
      if (data.error) this.showResult(data, true); else { this.showToast('Snapshot deleted'); this.loadSnapshots(); }
    },
    async viewSnapshotPackages(name) {
      const data = await this.get('/snapshots/' + encodeURIComponent(name) + '/packages');
      this.viewPackagesName = name; this.viewPackagesList = Array.isArray(data) ? data : []; this.activeModal = 'viewPackages';
    },

    async loadPackages() {
      this.allPackages = [];
      const loads = [];
      const collect = (label, pkgs) => {
        if (!Array.isArray(pkgs)) return;
        pkgs.forEach(k => {
          const parsed = this.parseAptlyPackage(k);
          this.allPackages.push({ key: k, name: parsed.name, version: parsed.version, architecture: parsed.architecture, publish: label, raw: k });
        });
      };
      if (this.packageSearchMode === 'all' || this.packageSearchMode === 'published') {
        for (const p of this.publishList) {
          const sources = p.Sources || [];
          if (!sources.length) { console.warn('Publish', p.Prefix, p.Distribution, ': no sources'); continue; }
          const label = (p.Prefix||'(root)') + '/' + p.Distribution;
          const sourceKind = p.SourceKind || 'snapshot';
          for (const src of sources) {
            const sourceName = src.Name;
            if (!sourceName) continue;
            const endpoint = sourceKind === 'local'
              ? '/repos/' + encodeURIComponent(sourceName) + '/packages'
              : '/snapshots/' + encodeURIComponent(sourceName) + '/packages';
            loads.push(
              this.get(endpoint)
                .then(pkgs => collect(label + ' (' + (src.Component||'default') + ')', pkgs))
                .catch(err => console.warn('Failed to load packages for publish', label, endpoint, err))
            );
          }
        }
      }
      if (this.packageSearchMode === 'all' || this.packageSearchMode === 'mirrors') {
        for (const m of this.mirrors) {
          loads.push(
            this.get('/mirrors/' + encodeURIComponent(m.Name) + '/packages')
              .then(pkgs => collect('mirror:' + m.Name, pkgs))
              .catch(err => console.warn('Failed to load packages for mirror', m.Name, err))
          );
        }
      }
      if (this.packageSearchMode === 'all' || this.packageSearchMode === 'snapshots') {
        for (const s of this.snapshots) {
          if (!s.Name) continue;
          loads.push(
            this.get('/snapshots/' + encodeURIComponent(s.Name) + '/packages')
              .then(pkgs => collect('snapshot:' + s.Name, pkgs))
              .catch(err => console.warn('Failed to load packages for snapshot', s.Name, err))
          );
        }
      }
      if (this.packageSearchMode === 'all' || this.packageSearchMode === 'repos') {
        for (const r of this.repos) {
          loads.push(
            this.get('/repos/' + encodeURIComponent(r.Name) + '/packages')
              .then(pkgs => collect('repo:' + r.Name, pkgs))
              .catch(err => console.warn('Failed to load packages for repo', r.Name, err))
          );
        }
      }
      await Promise.all(loads);
      console.log('loadPackages done, total:', this.allPackages.length);
      this.pagePackages = 1;
    },
    async viewPublishPackages(p) {
      const sources = p.Sources || [];
      if (!sources.length) { this.showToast('No sources found for this publish', 'error'); return; }
      this.viewPackagesName = (p.Prefix||'(root)') + '/' + p.Distribution;
      this.viewPackagesList = [];
      const loads = [];
      const sourceKind = p.SourceKind || 'snapshot';
      for (const src of sources) {
        const sourceName = src.Name;
        if (!sourceName) continue;
        const endpoint = sourceKind === 'local'
          ? '/repos/' + encodeURIComponent(sourceName) + '/packages'
          : '/snapshots/' + encodeURIComponent(sourceName) + '/packages';
        loads.push(
          this.get(endpoint)
            .then(pkgs => {
              if (Array.isArray(pkgs)) {
                pkgs.forEach(k => this.viewPackagesList.push(k));
              }
            })
            .catch(err => console.warn('viewPublishPackages error', endpoint, err))
        );
      }
      await Promise.all(loads);
      this.activeModal = 'viewPackages';
    },

    buildPublishSources() {
      const selected = this.formPublish.selectedSources || [];
      if (!selected.length) return [];
      return selected.map(s => ({ Component: s.component || 'main', Name: s.name }));
    },
    addPublishSource() {
      this.formPublish.selectedSources.push({ name: '', component: 'main' });
    },
    removePublishSource(index) {
      this.formPublish.selectedSources.splice(index, 1);
    },
    buildPublishSourcesPreview() { return JSON.stringify(this.buildPublishSources(), null, 2); },

    buildSigningPayload() {
      const fp = (this.formPublish.signKeyId || '').trim();
      if (!fp) return null;
      if (fp === '__skip__') return {Skip: true};
      return { Batch: true, GpgKey: fp };
    },

    parseList(str) { return (str||'').split(',').map(s=>s.trim()).filter(Boolean); },

    async doPublish() {
      const prefix = (this.formPublish.Prefix||'_empty_').trim() || '_empty_';
      const payload = { SourceKind: this.formPublish.sourceType||'snapshot', Sources: this.buildPublishSources(), Architectures: this.parseList(this.formPublish.Architectures), Distribution: this.formPublish.Distribution.trim() };
      if (!payload.Sources.length) { this.showToast('Select at least one source', 'error'); return; }
      if (!payload.Distribution) { this.showToast('Enter a distribution', 'error'); return; }
      const sign = this.buildSigningPayload();
      if (sign) payload.Signing = sign;
      const data = await this.post('/publish/' + encodeURIComponent(prefix), payload);
      if (data.error) this.showResult(data, true); else { this.showToast('Published'); this.closeModal(); this.loadPublish(); }
    },

    republish(p) {
      const existingSources = (p.Sources || []).map(s => ({
        name: s.Name || '',
        component: s.Component || 'main'
      }));
      this.formPublish = {
        Prefix: p.Prefix||'', Distribution: p.Distribution||'',
        sourceType: p.SourceKind||'snapshot',
        Architectures: (p.Architectures||[]).join(', '), signKeyId: '',
        selectedSources: existingSources
      };
      this.activeModal = 'updatePublish';
    },
    async doUpdatePublish() {
      const prefix = (this.formPublish.Prefix||'_empty_').trim() || '_empty_';
      const distribution = this.formPublish.Distribution.trim();
      const payload = { SourceKind: this.formPublish.sourceType||'snapshot', Sources: this.buildPublishSources(), Architectures: this.parseList(this.formPublish.Architectures) };
      const sign = this.buildSigningPayload();
      if (sign) payload.Signing = sign;
      const data = await this.put('/publish/' + encodeURIComponent(prefix) + '/' + encodeURIComponent(distribution), payload);
      if (data.error) this.showResult(data, true); else { this.showToast('Publish updated'); this.closeModal(); this.loadPublish(); }
    },

    openSwitchModal(p) { this.switchTarget = p; this.formSwitch = {snapshotName:'', ForceOverwrite:false}; this.activeModal = 'switchPublish'; },
    async doSwitchPublish() {
      const prefix = ((this.switchTarget.Prefix)||'_empty_').trim() || '_empty_';
      const distribution = this.switchTarget.Distribution;
      const snap = this.formSwitch.snapshotName;
      if (!snap) { this.showToast('Select a snapshot', 'error'); return; }
      const payload = { Snapshots: [{Component:'main', Name:snap}], ForceOverwrite: this.formSwitch.ForceOverwrite };
      const data = await this.patch('/publish/' + encodeURIComponent(prefix) + '/' + encodeURIComponent(distribution), payload);
      if (data.error) this.showResult(data, true); else { this.showToast('Publish switched'); this.closeModal(); this.loadPublish(); }
    },
    async unpublish(p) {
      const prefix = (p.Prefix||'').trim() || '_empty_';
      if (!confirm('Unpublish ' + (p.Prefix||'(root)') + '/' + p.Distribution + '?')) return;
      const data = await this.del('/publish/' + encodeURIComponent(prefix) + '/' + encodeURIComponent(p.Distribution) + '?force=1');
      if (data.error) this.showResult(data, true); else { this.showToast('Unpublished'); this.loadPublish(); }
    },

    // Tasks
    addTask(id, name) { this.tasks.push({id, name, done:false, progress:0}); },
    updateTask(id, done, progress=0) { const t = this.tasks.find(x => x.id == id); if (t) { t.done = done; t.progress = progress; } },
    removeTask(id) { this.tasks = this.tasks.filter(x => x.id != id); },
    async pollTask(id, name) {
      this.addTask(id, name);
      const poll = async () => {
        const data = await this.get('/tasks/' + id);
        if (data && data.State) {
          if (data.State === 'SUCCEEDED') { this.updateTask(id,true,100); setTimeout(()=>this.removeTask(id),2000); this.showToast(name+' done'); return; }
          if (data.State === 'FAILED') { this.updateTask(id,true,100); setTimeout(()=>this.removeTask(id),2000); this.showToast(name+' failed: '+(data.Error||''),'error'); return; }
          let prog=0; if (data.Progress) prog = Math.round((data.Progress.Current||0)/(data.Progress.Total||1)*100);
          this.updateTask(id,false,prog); setTimeout(poll,1500);
        } else { this.updateTask(id,true,100); setTimeout(()=>this.removeTask(id),2000); this.showToast(name+' requested'); }
      };
      poll();
    },

    // GPG keys
    async handleGpgFile(ev) {
      const files = Array.from(ev.target.files); if (!files.length) return;
      this.gpgUploading = true; this.gpgUploadProgress = 20; this.showToast('Importing GPG keys...');
      const fd = new FormData(); files.forEach(f => fd.append('file', f));
      const data = await this.postForm('/gpg/keys', fd);
      this.gpgUploading = false; this.gpgUploadProgress = 0;
      if (data.error) { this.showResult(data, true); }
      else { this.showToast((data.imported ? data.imported.length : 1) + ' key(s) imported'); this.gpgKeys = Array.isArray(data.keys) ? data.keys : []; }
      ev.target.value = '';
    },
    async deleteGpgKey(fingerprint) {
      if (!confirm('Remove key ' + fingerprint + '?')) return;
      const data = await this.del('/gpg/keys/' + fingerprint);
      this.gpgKeys = Array.isArray(data.keys) ? data.keys : [];
    },
  };
}
