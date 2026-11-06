import{createRoot as e,jsx as t,jsxs as n}from"../../../lib/esm/react-19.js";var r=`iob-dialog-close`;function i(e){return!!e.form}var a=[`header`,`staticText`,`divider`];function o(e,t){return e==null?``:typeof e==`object`?e[t]||e.en||Object.values(e).find(e=>!!e)||``:String(e)}function s(e){let t={};for(let[n,r]of Object.entries(e.items||{}))r&&!a.includes(r.type)&&(t[n]=r.type);return t}function c(e){return typeof e==`string`?e:typeof e==`number`||typeof e==`boolean`?e.toString():JSON.stringify(e)}function l(e,t){if(t!=null)switch(e){case`number`:case`slider`:{if(typeof t==`number`)return Number.isFinite(t)?t:void 0;let e=c(t).trim().replace(`,`,`.`);if(!e)return;let n=Number(e);return Number.isFinite(n)?n:void 0}case`checkbox`:return t===!0||t===`true`||t===1||t===`1`;default:return c(t)}}function u(e,t){let n={};for(let[r,i]of Object.entries(e)){let e=l(i,t[r]);e!==void 0&&(n[r]=e)}return n}var d=`"Roboto", "Helvetica", "Arial", sans-serif`,f=Object.freeze({type:`light`,primary:`#3399CC`,primaryContrast:`#FFFFFF`,secondary:`#164477`,secondaryContrast:`#FFFFFF`,background:`#FFFFFF`,paper:`#FFFFFF`,text:`rgba(0, 0, 0, 0.87)`,textSecondary:`rgba(0, 0, 0, 0.6)`,divider:`rgba(0, 0, 0, 0.12)`,error:`#D32F2F`,warning:`#ED6C02`,info:`#0288D1`,success:`#2E7D32`,fontFamily:d,fontSize:14,borderRadius:4}),p=Object.freeze({type:`dark`,primary:`#4DABF5`,primaryContrast:`rgba(0, 0, 0, 0.87)`,secondary:`#436A93`,secondaryContrast:`#FFFFFF`,background:`#121212`,paper:`#121212`,text:`#FFFFFF`,textSecondary:`rgba(255, 255, 255, 0.7)`,divider:`rgba(255, 255, 255, 0.12)`,error:`#F44336`,warning:`#FFA726`,info:`#29B6F6`,success:`#66BB6A`,fontFamily:d,fontSize:14,borderRadius:4}),m=[`primary`,`primaryContrast`,`secondary`,`secondaryContrast`,`background`,`paper`,`text`,`textSecondary`,`divider`,`error`,`warning`,`info`,`success`,`fontFamily`],h=[`fontSize`,`borderRadius`];function g(e){return{...e===`dark`?p:f}}function _(e){if(!e||typeof e!=`object`)return g(typeof e==`string`?e:`light`);let t=e,n=g(typeof t.type==`string`?t.type:`light`);for(let e of m){let r=t[e];typeof r==`string`&&r.trim()&&(n[e]=r.trim())}for(let e of h){let r=t[e],i=typeof r==`string`?parseFloat(r):r;typeof i==`number`&&Number.isFinite(i)&&i>=0&&(n[e]=i)}return n}function v(e,t){return e.type===t.type&&m.every(n=>e[n]===t[n])&&h.every(n=>e[n]===t[n])}function y(e){return`--iob-${e.replace(/[A-Z]/g,e=>`-${e.toLowerCase()}`)}`}function b(e){let t={};for(let n of m)t[y(n)]=e[n];for(let n of h)t[y(n)]=`${e[n]}px`;return t[`color-scheme`]=e.type,t}var x={ok:{en:`OK`,"zh-cn":`确定`},cancel:{en:`Cancel`,de:`Abbrechen`,ru:`Отмена`,pt:`Cancelar`,nl:`Annuleren`,fr:`Annuler`,it:`Annulla`,es:`Cancelar`,pl:`Anuluj`,uk:`Скасувати`,"zh-cn":`取消`},close:{en:`Close`,de:`Schließen`,ru:`Закрыть`,pt:`Fechar`,nl:`Sluiten`,fr:`Fermer`,it:`Chiudi`,es:`Cerrar`,pl:`Zamknij`,uk:`Закрити`,"zh-cn":`关闭`}},S=`
dialog {
    box-sizing: border-box;
    width: 480px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 32px);
    padding: 0;
    border: 0;
    border-radius: calc(var(--iob-border-radius) * 2);
    background: var(--iob-paper);
    color: var(--iob-text);
    font-family: var(--iob-font-family);
    font-size: var(--iob-font-size);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}
/* as the dialogs of MUI: a dark paper gets lighter the higher it lies */
dialog.dark { background-image: linear-gradient(rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0.16)); }
dialog::backdrop { background: rgba(0, 0, 0, 0.5); }
dialog:focus { outline: none; }
form { display: flex; flex-direction: column; height: 100%; max-height: inherit; margin: 0; }
header { display: flex; align-items: center; gap: 8px; padding: 12px 8px 12px 16px; font-size: 1.15em; font-weight: 500; }
header span { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.body { flex: 1; min-height: 0; padding: 0 16px 16px; overflow: auto; display: flex; flex-direction: column; gap: 12px; }
footer { display: flex; justify-content: flex-end; gap: 8px; padding: 0 16px 16px; }
button { font: inherit; padding: 6px 16px; border-radius: var(--iob-border-radius); border: 1px solid var(--iob-primary); background: transparent; color: var(--iob-primary); cursor: pointer; }
button.primary { background: var(--iob-primary); color: var(--iob-primary-contrast); }
button.close { border: 0; padding: 2px 8px; font-size: 1.4em; line-height: 1; color: var(--iob-text-secondary); }
label { display: flex; flex-direction: column; gap: 4px; }
label.check { flex-direction: row; align-items: center; gap: 8px; }
input, select, textarea { font: inherit; accent-color: var(--iob-primary); }
.help { color: var(--iob-text-secondary); font-size: 0.85em; }
h3 { margin: 4px 0 0; font-size: 1em; }
p { margin: 0; }
hr { width: 100%; border: 0; border-top: 1px solid var(--iob-divider); margin: 0; }
[hidden] { display: none !important; }
`;function C(e){if(!e)return null;try{let t=Function(`data`,`return (${e});`);return e=>{try{return!!t(e)}catch{return!1}}}catch{return null}}function w(e){return typeof e==`string`?e:typeof e==`number`||typeof e==`boolean`?String(e):``}function T(e){let{input:t,setting:n}=e;if(t)return t instanceof HTMLInputElement&&t.type===`checkbox`?t.checked:t instanceof HTMLSelectElement?n.options?.[t.selectedIndex]?.value:t.value}function E(e,t,n,r,i){let a={name:t,setting:n,box:e.createElement(`div`),hidden:C(n.hidden),disabled:C(n.disabled)},s=o(n.label,i);switch(n.type){case`header`:return a.box=e.createElement(`h3`),a.box.textContent=o(n.text,i)||s,a;case`staticText`:return a.box=e.createElement(`p`),a.box.textContent=o(n.text,i)||s,a;case`divider`:return a.box=e.createElement(`hr`),a}let c=e.createElement(`label`);a.box=c;let l=e.createElement(`span`);if(l.textContent=s||t,n.type===`checkbox`){let t=e.createElement(`input`);t.type=`checkbox`,t.checked=r===!0||r===`true`,c.className=`check`,c.append(t,l),a.input=t}else if(n.type===`select`){let t=e.createElement(`select`);for(let r of n.options||[]){let n=e.createElement(`option`);n.textContent=o(r.label,i),t.append(n)}let s=(n.options||[]).findIndex(e=>String(e.value)===w(r));t.selectedIndex=s===-1?0:s,c.append(l,t),a.input=t}else if(n.type===`text`&&(n.minRows||1)>1){let t=e.createElement(`textarea`);t.rows=n.minRows||2,t.value=w(r),c.append(l,t),a.input=t}else{let t=e.createElement(`input`),i=w(r);switch(n.type){case`number`:case`slider`:t.type=n.type===`slider`?`range`:`number`,n.min!==void 0&&(t.min=String(n.min)),n.max!==void 0&&(t.max=String(n.max)),t.step=n.step===void 0?`any`:String(n.step);break;case`password`:t.type=`password`;break;case`color`:t.type=!i||/^#[0-9a-f]{6}$/i.test(i)?`color`:`text`;break;default:t.type=`text`}if(t.value=i,t.type===`range`){let n=e.createElement(`output`);n.textContent=t.value,t.addEventListener(`input`,()=>n.textContent=t.value),l.append(`: `,n)}c.append(l,t),a.input=t}if(n.help){let t=e.createElement(`span`);t.className=`help`,t.textContent=o(n.help,i),c.append(t)}return a}function D(e,t={}){let n=t.lang||`en`,a=document,c=e=>x[e][n]||x[e].en||e,l=a.createElement(`div`);l.setAttribute(`data-iob-dialog`,``);let d=l.attachShadow({mode:`open`}),f=a.createElement(`style`);f.textContent=S;let p=a.createElement(`dialog`),m=_(t.theme);p.className=m.type===`dark`?`dark`:``;for(let[e,t]of Object.entries(b(m)))p.style.setProperty(e,t);e.width&&(p.style.width=`${e.width}px`),e.height&&(p.style.height=`${e.height}px`);let h=a.createElement(`form`),g=a.createElement(`header`),v=a.createElement(`span`);v.textContent=o(e.title,n);let y=a.createElement(`button`);y.type=`button`,y.className=`close`,y.title=c(`close`),y.setAttribute(`aria-label`,c(`close`)),y.textContent=`×`,g.append(v,y);let C=a.createElement(`div`);return C.className=`body`,h.append(g,C),p.append(h),d.append(f,p),new Promise(t=>{let f=!1,m=e=>{f||(f=!0,p.open&&p.close(),l.remove(),t(e))};if(y.addEventListener(`click`,()=>m(null)),p.addEventListener(`close`,()=>m(null)),h.addEventListener(`submit`,e=>e.preventDefault()),i(e)){let t={},r=[];for(let[t,i]of Object.entries(e.form.items||{})){let o=e.data?.[t]??i.default,s=E(a,t,i,o,n);r.push(s),C.append(s.box)}let i=()=>{for(let e of r)e.input&&(t[e.name]=T(e));return t},l=()=>{let e=i();for(let t of r)t.box.hidden=t.hidden?t.hidden(e):!1,t.input&&(t.input.disabled=t.disabled?t.disabled(e):!1)};h.addEventListener(`input`,l),h.addEventListener(`change`,l),l();let d=r.find(e=>e.input&&!e.box.hidden&&!e.input.disabled);d?.input&&(d.input.autofocus=!0);let f=a.createElement(`footer`),p=a.createElement(`button`);p.type=`button`,p.textContent=o(e.cancel,n)||c(`cancel`),p.addEventListener(`click`,()=>m(null));let g=a.createElement(`button`);g.type=`submit`,g.className=`primary`,g.textContent=o(e.ok,n)||c(`ok`),f.append(p,g),h.append(f),h.addEventListener(`submit`,()=>m(u(s(e.form),i())))}else C.append(e.element),p.addEventListener(r,e=>m(e.detail??null));a.body.append(l),p.showModal(),d.activeElement&&d.activeElement!==y||(p.tabIndex=-1,p.focus())})}function O(e){return[...new Set(e.filter(e=>typeof e==`string`&&!!e))]}var k=[`socket`,`dialogs`,`theme`,`editMode`,`settings`,`value`],A=class extends HTMLElement{states={};objects={};#e=null;#t={};#n=_(`light`);#r=!1;#i=null;#a=void 0;#o=null;#s=!1;#c=(e,t)=>{this.#o?.states.includes(e)&&(this.states[e]=t||null,this.#_())};#l=(e,t)=>{this.#o?.objects.includes(e)&&(this.objects[e]=t||null,this.#d())};get socket(){return this.#e}set socket(e){this.#e=e||null,this.#d()}get settings(){return this.#t}set settings(e){this.#t=e||{},this.#d()}get theme(){return this.#n}set theme(e){let t=_(e);v(t,this.#n)||(this.#n=t,this.#u(),this.#_())}get editMode(){return this.#r}set editMode(e){let t=!!e;t!==this.#r&&(this.#r=t,this.#_())}get dialogs(){return this.#i}set dialogs(e){this.#i=e||null}get value(){return this.#a}set value(e){e!==this.#a&&(this.#a=e,this.#_())}connectedCallback(){for(let e of k)if(Object.prototype.hasOwnProperty.call(this,e)){let t=this[e];delete this[e],this[e]=t}this.#u(),this.#d()}disconnectedCallback(){this.#g()}getStateIds(e){return[]}getObjectIds(e){return[]}get systemLang(){return this.#e?.systemLang||`en`}text(e){return o(e,this.systemLang)}setState(e,t){return this.#e&&!this.#r?this.#e.setState(e,t):Promise.resolve()}changeValue(e){return this.#r||this.emit(`iob-change`,e)?!1:(this.value=e,!0)}emit(e,t){return this.dispatchEvent(new CustomEvent(e,{detail:t,bubbles:!0,composed:!0,cancelable:!0}))}async openDialog(e){if(this.#r)return null;let t=this.#i?await this.#i.open(e):await D(e,{lang:this.systemLang,theme:this.#n});return i(e)?t&&typeof t==`object`?u(s(e.form),t):null:t??null}#u(){for(let[e,t]of Object.entries(b(this.#n)))this.style.setProperty(e,t)}#d(){if(!this.isConnected)return;let e=this.#e,t=e?O(this.getStateIds(this.#t)):[],n=e?O(this.getObjectIds(this.#t)):[];this.#o&&this.#o.socket!==e&&this.#g();let r=this.#o?.states||[],i=this.#o?.objects||[],a=r.filter(e=>!t.includes(e)),o=i.filter(e=>!n.includes(e)),s=t.filter(e=>!r.includes(e)),c=n.filter(e=>!i.includes(e));e&&a.length&&e.unsubscribeState(a,this.#c),e&&o.length&&this.#h(e,o);for(let e of a)delete this.states[e];for(let e of[...a,...o])!t.includes(e)&&!n.includes(e)&&delete this.objects[e];this.#o=e&&(t.length||n.length)?{socket:e,states:t,objects:n}:null,e&&s.length&&this.#p(e,s),e&&c.length&&this.#m(e,c),this.#_()}#f(e,t,n){return this.#o?.socket===e&&this.#o[t].includes(n)}#p(e,t){e.subscribeState(t,this.#c).catch(e=>console.warn(`<${this.localName}>: cannot subscribe ${t.join(`, `)}: ${e}`));for(let n of t)e.getState(n).then(t=>{this.#f(e,`states`,n)&&this.states[n]===void 0&&(this.states[n]=t||null,this.#_())}).catch(()=>{}),e.getObject(n).then(t=>{this.#f(e,`states`,n)&&!this.#f(e,`objects`,n)&&(this.objects[n]=t||null,this.#_())}).catch(()=>{})}#m(e,t){e.subscribeObject(t,this.#l).catch(e=>console.warn(`<${this.localName}>: cannot subscribe the objects ${t.join(`, `)}: ${e}`));for(let n of t)e.getObject(n).then(t=>{this.#f(e,`objects`,n)&&(this.objects[n]=t||null,this.#d())}).catch(()=>{})}#h(e,t){e.unsubscribeObject(t,this.#l).catch(()=>{})}#g(){if(this.#o){let{socket:e,states:t,objects:n}=this.#o;t.length&&e.unsubscribeState(t,this.#c),n.length&&this.#h(e,n),this.#o=null}this.states={},this.objects={}}#_(){this.#s||(this.#s=!0,queueMicrotask(()=>{this.#s=!1,this.isConnected&&this.render()}))}};function j(e,t){let n=typeof e==`string`?e:e.tag;customElements.get(n)||customElements.define(n,t)}var M=`iob-ping-overview`,N=`M13 22h8v-7h-3v-4h-5V9h3V2H8v7h3v2H6v4H3v7h8v-7H8v-2h8v2h-3z`;function P({text:e,editMode:r}){return/* @__PURE__ */ n(`div`,{className:`hint${r?` edit`:``}`,children:[/* @__PURE__ */ t(`svg`,{viewBox:`0 0 24 24`,"aria-hidden":`true`,children:/* @__PURE__ */ t(`path`,{d:N})}),/* @__PURE__ */ t(`span`,{children:e})]})}var F={online:`Online`,offline:`Offline`,unknown:`Unknown`,ms:`ms`,copyIp:`Copy IP`,chooseDevice:`Choose a device in the settings`,notDevice:`Not a device of the ping adapter`,chooseInstance:`Choose an instance of the ping adapter in the settings`,noInstance:`Instance not found`,unknownCount:`unknown`,devices:`devices`,empty:`No ping devices configured`,dialogTitle:`Ping devices`,onlineSince:`Online since`,offlineSince:`Last seen`,noData:`No data yet`,disabled:`Disabled`},I={en:F,de:{online:`Online`,offline:`Offline`,unknown:`Unbekannt`,ms:`ms`,copyIp:`IP kopieren`,chooseDevice:`Gerät in den Einstellungen wählen`,notDevice:`Kein Gerät des Ping-Adapters`,chooseInstance:`Instanz des Ping-Adapters in den Einstellungen wählen`,noInstance:`Instanz nicht gefunden`,unknownCount:`unbekannt`,devices:`Geräte`,empty:`Keine Ping-Geräte konfiguriert`,dialogTitle:`Ping-Geräte`,onlineSince:`Online seit`,offlineSince:`Zuletzt gesehen`,noData:`Noch keine Daten`,disabled:`Deaktiviert`},ru:{online:`В сети`,offline:`Не в сети`,unknown:`Неизвестно`,ms:`мс`,copyIp:`Копировать IP`,chooseDevice:`Выберите устройство в настройках`,notDevice:`Это не устройство адаптера Ping`,chooseInstance:`Выберите экземпляр адаптера Ping в настройках`,noInstance:`Экземпляр не найден`,unknownCount:`неизвестно`,devices:`устройств`,empty:`Нет настроенных устройств`,dialogTitle:`Устройства Ping`,onlineSince:`В сети с`,offlineSince:`Не в сети с`,noData:`Нет данных`,disabled:`Отключено`},pt:{online:`Online`,offline:`Offline`,unknown:`Desconhecido`,ms:`ms`,copyIp:`Copiar IP`,chooseDevice:`Escolha um dispositivo nas configurações`,notDevice:`Não é um dispositivo do adaptador Ping`,chooseInstance:`Escolha uma instância do adaptador Ping nas configurações`,noInstance:`Instância não encontrada`,unknownCount:`desconhecido`,devices:`dispositivos`,empty:`Nenhum dispositivo de ping configurado`,dialogTitle:`Dispositivos de ping`,onlineSince:`Online desde`,offlineSince:`Offline desde`,noData:`Sem dados ainda`,disabled:`Desativado`},nl:{online:`Online`,offline:`Offline`,unknown:`Onbekend`,ms:`ms`,copyIp:`IP kopiëren`,chooseDevice:`Kies een apparaat in de instellingen`,notDevice:`Geen apparaat van de ping-adapter`,chooseInstance:`Kies een instantie van de ping-adapter in de instellingen`,noInstance:`Instantie niet gevonden`,unknownCount:`onbekend`,devices:`apparaten`,empty:`Geen ping-apparaten geconfigureerd`,dialogTitle:`Ping-apparaten`,onlineSince:`Online sinds`,offlineSince:`Offline sinds`,noData:`Nog geen data`,disabled:`Uitgeschakeld`},fr:{online:`En ligne`,offline:`Hors ligne`,unknown:`Inconnu`,ms:`ms`,copyIp:`Copier l'IP`,chooseDevice:`Choisissez un appareil dans les paramètres`,notDevice:`Pas un appareil de l'adaptateur Ping`,chooseInstance:`Choisissez une instance de l'adaptateur Ping dans les paramètres`,noInstance:`Instance introuvable`,unknownCount:`inconnu`,devices:`appareils`,empty:`Aucun appareil ping configuré`,dialogTitle:`Appareils ping`,onlineSince:`En ligne depuis`,offlineSince:`Hors ligne depuis`,noData:`Pas encore de données`,disabled:`Désactivé`},it:{online:`Online`,offline:`Offline`,unknown:`Sconosciuto`,ms:`ms`,copyIp:`Copia IP`,chooseDevice:`Scegli un dispositivo nelle impostazioni`,notDevice:`Non è un dispositivo dell'adattatore Ping`,chooseInstance:`Scegli un'istanza dell'adattatore Ping nelle impostazioni`,noInstance:`Istanza non trovata`,unknownCount:`sconosciuto`,devices:`dispositivi`,empty:`Nessun dispositivo ping configurato`,dialogTitle:`Dispositivi ping`,onlineSince:`Online da`,offlineSince:`Offline da`,noData:`Nessun dato`,disabled:`Disattivato`},es:{online:`En línea`,offline:`Sin conexión`,unknown:`Desconocido`,ms:`ms`,copyIp:`Copiar IP`,chooseDevice:`Elija un dispositivo en la configuración`,notDevice:`No es un dispositivo del adaptador Ping`,chooseInstance:`Elija una instancia del adaptador Ping en la configuración`,noInstance:`Instancia no encontrada`,unknownCount:`desconocido`,devices:`dispositivos`,empty:`No hay dispositivos de ping configurados`,dialogTitle:`Dispositivos de ping`,onlineSince:`En línea desde`,offlineSince:`Sin conexión desde`,noData:`Aún sin datos`,disabled:`Deshabilitado`},pl:{online:`Online`,offline:`Offline`,unknown:`Nieznany`,ms:`ms`,copyIp:`Kopiuj IP`,chooseDevice:`Wybierz urządzenie w ustawieniach`,notDevice:`To nie jest urządzenie adaptera Ping`,chooseInstance:`Wybierz instancję adaptera Ping w ustawieniach`,noInstance:`Nie znaleziono instancji`,unknownCount:`nieznany`,devices:`urządzeń`,empty:`Brak skonfigurowanych urządzeń ping`,dialogTitle:`Urządzenia ping`,onlineSince:`Online od`,offlineSince:`Offline od`,noData:`Brak danych`,disabled:`Wyłączone`},uk:{online:`В мережі`,offline:`Не в мережі`,unknown:`Невідомо`,ms:`мс`,copyIp:`Копіювати IP`,chooseDevice:`Виберіть пристрій у налаштуваннях`,notDevice:`Це не пристрій адаптера Ping`,chooseInstance:`Виберіть екземпляр адаптера Ping у налаштуваннях`,noInstance:`Екземпляр не знайдено`,unknownCount:`невідомо`,devices:`пристроїв`,empty:`Немає налаштованих пристроїв ping`,dialogTitle:`Пристрої ping`,onlineSince:`В мережі з`,offlineSince:`Не в мережі з`,noData:`Поки немає даних`,disabled:`Вимкнено`},"zh-cn":{online:`在线`,offline:`离线`,unknown:`未知`,ms:`ms`,copyIp:`复制 IP`,chooseDevice:`请在设置中选择设备`,notDevice:`不是 Ping 适配器的设备`,chooseInstance:`请在设置中选择 Ping 适配器实例`,noInstance:`未找到实例`,unknownCount:`未知`,devices:`设备`,empty:`未配置任何 ping 设备`,dialogTitle:`Ping 设备`,onlineSince:`在线自`,offlineSince:`离线自`,noData:`暂无数据`,disabled:`已禁用`}};function L(e,t){return I[e]?.[t]||F[t]}var R=/[\][*,;'"`<>\\?]/g;function z(e){return e.startsWith(`system.adapter.`)?e:`system.adapter.${e}`}function B(e){return e.replace(R,`_`).replace(/[.\s]+/g,`_`).replace(/:/g,`_`)}function V(e,t,n){let r=(n.ip||``).trim(),i=(n.name||``).trim(),a=B(n.use_name&&i||r),o=`${e}${t?`.${t}`:``}.${a}`;return{ip:r,name:i,enabled:n.enabled!==!1,aliveId:n.extended_info?`${o}.alive`:o,timeId:n.extended_info?`${o}.time`:null}}function H(e){if(e?.type!==`instance`)return[];let t=e.native,n=e._id.replace(/^system\.adapter\./,``),r=e.common.host||``,i=t?.noHostname?``:r.replace(R,`_`).replace(/[.\s]+/g,`_`);return(Array.isArray(t?.devices)?t.devices:[]).filter(e=>e?.ip?.trim()).map(e=>V(n,i,e))}var U=`
:host {
    display: block;
    width: 100%;
    height: 100%;
}
.mount {
    width: 100%;
    height: 100%;
    /* the size of the box does not depend on what is in it */
    container-type: size;
}
.edit {
    pointer-events: none;
}
.hint {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(2px, 3cqmin, 8px);
    overflow: hidden;
    text-align: center;
    color: var(--iob-text-secondary);
    font-size: clamp(10px, 7cqmin, 15px);
}
.hint svg {
    width: clamp(16px, 14cqmin, 32px);
    height: clamp(16px, 14cqmin, 32px);
    fill: currentColor;
    flex: none;
}

.overview {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    padding: clamp(4px, 5cqmin, 12px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: clamp(3px, 5cqmin, 12px);
    overflow: hidden;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
    outline: none;
    border-radius: calc(var(--iob-border-radius) * 2);
}
.overview.clickable {
    cursor: pointer;
}
.overview.clickable:hover {
    background: color-mix(in srgb, currentColor 6%, transparent);
}
.overview:focus-visible {
    box-shadow: inset 0 0 0 2px var(--iob-primary);
}
.counts {
    display: flex;
    align-items: flex-start;
    gap: clamp(6px, 7cqmin, 20px);
    font-variant-numeric: tabular-nums;
}
.count {
    display: flex;
    flex-direction: column;
    align-items: center;
}
.number,
.slash {
    font-size: clamp(14px, 20cqmin, 56px);
    line-height: 1;
}
.number {
    font-weight: 800;
}
.slash {
    font-weight: 300;
    opacity: 0.4;
}
.count.online .number {
    color: var(--iob-success);
}
.count.offline .number {
    color: var(--iob-error);
}
.label {
    margin-top: 0.3em;
    font-size: clamp(8px, 6.5cqmin, 14px);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--iob-text-secondary);
}
.bar {
    display: flex;
    width: 90%;
    height: clamp(3px, 3.5cqmin, 8px);
    border-radius: 999px;
    overflow: hidden;
    background: var(--iob-divider);
}
.bar .online {
    background: var(--iob-success);
}
.bar .offline {
    background: var(--iob-error);
}
.bar .unknown {
    background: var(--iob-text-secondary);
    opacity: 0.5;
}
.total {
    max-width: 100%;
    font-size: clamp(9px, 7cqmin, 14px);
    color: var(--iob-text-secondary);
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
`,W=`
:host {
    display: block;
}
.list {
    box-sizing: border-box;
    width: 100%;
    color: var(--iob-text);
    font-family: var(--iob-font-family);
    font-size: var(--iob-font-size);
}
.summary {
    margin-bottom: 12px;
    color: var(--iob-text-secondary);
}
.summary b.online {
    color: var(--iob-success);
}
.summary b.offline {
    color: var(--iob-error);
}
.grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: 12px;
}
.tile {
    --state: var(--iob-text-secondary);
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid var(--iob-divider);
    border-left: 4px solid var(--state);
    border-radius: calc(var(--iob-border-radius) * 1.5);
    background: color-mix(in srgb, var(--state) 8%, var(--iob-paper));
}
.tile.online {
    --state: var(--iob-success);
}
.tile.offline {
    --state: var(--iob-error);
}
.dot {
    flex: none;
    width: 14px;
    height: 14px;
    border-radius: 50%;
    background: var(--state);
}
.tile.unknown .dot {
    opacity: 0.5;
}
.info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
}
.info > * {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.name {
    font-weight: 700;
}
.ip {
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.85em;
    color: var(--iob-text-secondary);
}
.since {
    margin-top: 2px;
    font-size: 0.85em;
    font-weight: 600;
    color: var(--state);
}
.empty {
    padding: 16px 0;
    color: var(--iob-text-secondary);
}
`,G=6e4,K=60*G,q=24*K;function J(e){return e<G?{value:Math.max(1,Math.floor(e/1e3)),unit:`second`}:e<K?{value:Math.floor(e/G),unit:`minute`}:{value:Math.floor(e/K),unit:`hour`}}function Y(e){try{return Intl.getCanonicalLocales(e)[0]||`en`}catch{return`en`}}function X(e,t,n,r){let i=Y(n),a=Math.max(0,t-e);if(a>=q)return new Date(e).toLocaleString(i,{dateStyle:`short`,timeStyle:`short`});let{value:o,unit:s}=J(a);return r?new Intl.RelativeTimeFormat(i,{numeric:`auto`}).format(-o,s):new Intl.NumberFormat(i,{style:`unit`,unit:s,unitDisplay:`long`}).format(o)}var Z=3e4;function Q(e){let t=e.filter(e=>e.alive===!0).length,n=e.filter(e=>e.alive===!1).length;return{online:t,offline:n,unknown:e.length-t-n}}function $(e){let t=e=>e.alive===!1?0:e.alive===!0?1:2;return[...e].sort((e,n)=>t(e)-t(n)||(e.name||e.ip).localeCompare(n.name||n.ip,void 0,{numeric:!0}))}function ee({entries:e,loading:r,editMode:i,word:a,onOpen:o}){let{online:s,offline:c,unknown:l}=Q(e),u=!i&&!r,d=[`overview`];u&&d.push(`clickable`),i&&d.push(`edit`);let f=`\xA0`;return r||(f=e.length?`${e.length} ${a(`devices`)}${l?` · ${l} ${a(`unknownCount`)}`:``}`:a(`empty`)),/* @__PURE__ */ n(`div`,{className:d.join(` `),role:u?`button`:void 0,tabIndex:u?0:void 0,title:u?a(`dialogTitle`):void 0,onClick:u?o:void 0,onKeyDown:u?e=>{(e.key===`Enter`||e.key===` `)&&(e.preventDefault(),o())}:void 0,children:[/* @__PURE__ */ n(`div`,{className:`counts`,children:[/* @__PURE__ */ n(`div`,{className:`count online`,children:[/* @__PURE__ */ t(`span`,{className:`number`,children:s}),/* @__PURE__ */ t(`span`,{className:`label`,children:a(`online`)})]}),/* @__PURE__ */ t(`span`,{className:`slash`,children:`/`}),/* @__PURE__ */ n(`div`,{className:`count offline`,children:[/* @__PURE__ */ t(`span`,{className:`number`,children:c}),/* @__PURE__ */ t(`span`,{className:`label`,children:a(`offline`)})]})]}),/* @__PURE__ */ n(`div`,{className:`bar`,children:[s?/* @__PURE__ */ t(`span`,{className:`online`,style:{flex:s}}):null,c?/* @__PURE__ */ t(`span`,{className:`offline`,style:{flex:c}}):null,l?/* @__PURE__ */ t(`span`,{className:`unknown`,style:{flex:l}}):null]}),/* @__PURE__ */ t(`div`,{className:`total`,children:f})]})}function te({entries:e,now:r,lang:i,word:a}){let{online:o,offline:s}=Q(e);return/* @__PURE__ */ n(`div`,{className:`list`,children:[/* @__PURE__ */ n(`div`,{className:`summary`,children:[/* @__PURE__ */ t(`b`,{className:`online`,children:o}),` `,a(`online`),` · `,/* @__PURE__ */ t(`b`,{className:`offline`,children:s}),` `,a(`offline`)]}),e.length?/* @__PURE__ */ t(`div`,{className:`grid`,children:$(e).map(e=>{let o=e.alive===null?`unknown`:e.alive?`online`:`offline`,s=a(`noData`);return e.enabled?e.alive!==null&&e.lastChange&&(s=e.alive?`${a(`onlineSince`)} ${X(e.lastChange,r,i,!1)}`:`${a(`offlineSince`)} ${X(e.lastChange,r,i,!0)}`):s=a(`disabled`),/* @__PURE__ */ n(`div`,{className:`tile ${o}`,children:[/* @__PURE__ */ t(`span`,{className:`dot`}),/* @__PURE__ */ n(`div`,{className:`info`,children:[/* @__PURE__ */ t(`span`,{className:`name`,children:e.name||e.ip}),e.name&&e.name!==e.ip?/* @__PURE__ */ t(`span`,{className:`ip`,children:e.ip}):null,/* @__PURE__ */ t(`span`,{className:`since`,children:s})]})]},e.aliveId)})}):/* @__PURE__ */ t(`div`,{className:`empty`,children:a(`empty`)})]})}j(M,class extends A{#e;#t=null;#n=null;constructor(){super();let t=this.attachShadow({mode:`open`}),n=document.createElement(`style`);n.textContent=U;let r=document.createElement(`div`);r.className=`mount`,t.append(n,r),this.#e=e(r)}connectedCallback(){super.connectedCallback(),this.#t&&this.#a()}disconnectedCallback(){super.disconnectedCallback(),this.#o()}getObjectIds(e){return e.instance?[z(e.instance)]:[]}getStateIds(e){return this.#r(e).filter(e=>e.enabled).map(e=>e.aliveId)}#r(e){if(!e.instance)return[];let t=H(this.objects[z(e.instance)]);return e.hideDisabled?t.filter(e=>e.enabled):t}#i(){return this.#r(this.settings).map(e=>{let t=e.enabled?this.states[e.aliveId]:null,n=t?.val!==null&&t?.val!==void 0;return{...e,alive:n?!!t.val:null,lastChange:n&&(t.lc||t.ts)||null}})}#a(){this.#n||=setInterval(()=>this.#t?.(),Z)}#o(){this.#n&&=(clearInterval(this.#n),null)}#s=()=>{!this.editMode&&!this.#t&&this.#c()};async#c(){let n=this.systemLang,r=e=>L(n,e),i=document.createElement(`div`);for(let[e,t]of Object.entries(b(this.theme)))i.style.setProperty(e,t);let a=i.attachShadow({mode:`open`}),o=document.createElement(`style`);o.textContent=W;let s=document.createElement(`div`);a.append(o,s);let c=e(s);this.#t=()=>c.render(/* @__PURE__ */ t(te,{entries:this.#i(),now:Date.now(),lang:n,word:r})),this.#t(),this.#a();try{await this.openDialog({title:r(`dialogTitle`),element:i,width:900})}finally{this.#o(),this.#t=null,c.unmount()}}render(){let e=this.settings,n=this.systemLang,r=e=>L(n,e);if(!e.instance)this.#e.render(/* @__PURE__ */ t(P,{text:r(`chooseInstance`),editMode:this.editMode}));else{let n=this.objects[z(e.instance)];n===null?this.#e.render(/* @__PURE__ */ t(P,{text:`${r(`noInstance`)}: ${e.instance}`,editMode:this.editMode})):this.#e.render(/* @__PURE__ */ t(ee,{entries:this.#i(),loading:n===void 0,editMode:this.editMode,word:r,onOpen:this.#s}))}this.#t?.()}});