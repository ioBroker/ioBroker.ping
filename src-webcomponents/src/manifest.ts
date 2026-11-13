/**
 * The manifests of `<iob-ping-device>` and `<iob-ping-overview>`. Read by the build only (`vite.config.ts`), which
 * writes each as `<name>.json` next to its module - a host reads that file for its palette and its settings
 * without loading the module.
 *
 * The `name` of a manifest is the label of the devices widget that shows the same (`common.deviceWidgets` in
 * io-package.json): devices then offers its own widget and leaves the web component out, other hosts show the
 * web component. Change both together.
 */
import type { WebComponentManifest } from '@iobroker/web-components';

// with the extension: `vite.config.ts` imports this file, and Vite may load its config natively
import { DEVICE_TAG, getModuleFile, OVERVIEW_TAG, type ComponentName } from './constants.ts';

const SCHEMA = 'https://raw.githubusercontent.com/ioBroker/web-components/main/schemas/manifest.json';

const deviceManifest: WebComponentManifest = {
    $schema: SCHEMA,
    manifestVersion: 1,
    tag: DEVICE_TAG,
    // the label of the devices widget `PingIpAddressComponent`, which has no translations
    name: 'Ping Device',
    description: {
        en: 'Shows whether one device answers, with its IP address and response time',
        de: 'Zeigt, ob ein Gerät antwortet, mit seiner IP-Adresse und Antwortzeit',
        ru: 'Показывает, отвечает ли устройство, с его IP-адресом и временем отклика',
        pt: 'Mostra se um dispositivo responde, com o seu endereço IP e tempo de resposta',
        nl: 'Toont of een apparaat antwoordt, met zijn IP-adres en reactietijd',
        fr: 'Indique si un appareil répond, avec son adresse IP et son temps de réponse',
        it: 'Mostra se un dispositivo risponde, con il suo indirizzo IP e il tempo di risposta',
        es: 'Muestra si un dispositivo responde, con su dirección IP y tiempo de respuesta',
        pl: 'Pokazuje, czy urządzenie odpowiada, wraz z adresem IP i czasem odpowiedzi',
        uk: 'Показує, чи відповідає пристрій, з його IP-адресою та часом відгуку',
        'zh-cn': '显示一个设备是否响应，以及其 IP 地址和响应时间',
    },
    // relative to this file: the preview of the devices widget, /adapter/ping/dm-widgets/device.png
    icon: '../dm-widgets/device.png',
    module: getModuleFile('ping-device'),
    // a tile of devices: one cell of 160 px
    size: { width: 160, height: 160 },
    settings: {
        type: 'panel',
        items: {
            device: {
                type: 'objectId',
                types: 'state',
                // no root: an alias of a ping state is allowed too; the element takes the instance from the ID
                label: {
                    en: 'Device',
                    de: 'Gerät',
                    ru: 'Устройство',
                    pt: 'Dispositivo',
                    nl: 'Apparaat',
                    fr: 'Appareil',
                    it: 'Dispositivo',
                    es: 'Dispositivo',
                    pl: 'Urządzenie',
                    uk: 'Пристрій',
                    'zh-cn': '设备',
                },
                help: {
                    en: 'A state of the device: ping.0.<host>.<IP>, or its .alive with "Extended Info", or an alias of it',
                    de: 'Ein Datenpunkt des Geräts: ping.0.<Host>.<IP>, oder sein .alive bei "Erweiterte Informationen", oder ein Alias darauf',
                    ru: 'Состояние устройства: ping.0.<хост>.<IP> или его .alive при "Расширенная информация", или алиас на него',
                    pt: 'Um estado do dispositivo: ping.0.<host>.<IP>, ou o seu .alive com "Extended Info", ou um alias dele',
                    nl: 'Een status van het apparaat: ping.0.<host>.<IP>, of zijn .alive bij "Extended Info", of een alias ervan',
                    fr: "Un état de l'appareil : ping.0.<hôte>.<IP>, ou son .alive avec « Extended Info », ou un alias de celui-ci",
                    it: 'Uno stato del dispositivo: ping.0.<host>.<IP>, o il suo .alive con "Extended Info", o un alias di esso',
                    es: 'Un estado del dispositivo: ping.0.<host>.<IP>, o su .alive con "Extended Info", o un alias de él',
                    pl: 'Stan urządzenia: ping.0.<host>.<IP> lub jego .alive przy "Extended Info", lub jego alias',
                    uk: 'Стан пристрою: ping.0.<хост>.<IP> або його .alive з "Розширена інформація", або аліас на нього',
                    'zh-cn': '设备的状态：ping.0.<主机>.<IP>，或启用"扩展信息"时的 .alive，或其别名',
                },
            },
            showName: {
                type: 'checkbox',
                default: true,
                label: {
                    en: 'Show device name',
                    de: 'Gerätenamen anzeigen',
                    ru: 'Показывать имя устройства',
                    pt: 'Mostrar nome do dispositivo',
                    nl: 'Apparaatnaam weergeven',
                    fr: "Afficher le nom de l'appareil",
                    it: 'Mostra nome dispositivo',
                    es: 'Mostrar nombre del dispositivo',
                    pl: 'Pokaż nazwę urządzenia',
                    uk: "Показувати ім'я пристрою",
                    'zh-cn': '显示设备名称',
                },
            },
            name: {
                type: 'text',
                hidden: '!data.showName',
                label: {
                    en: 'Name',
                    de: 'Name',
                    ru: 'Имя',
                    pt: 'Nome',
                    nl: 'Naam',
                    fr: 'Nom',
                    it: 'Nome',
                    es: 'Nombre',
                    pl: 'Nazwa',
                    uk: "Ім'я",
                    'zh-cn': '名称',
                },
                help: {
                    en: 'Instead of the name in the configuration of the adapter',
                    de: 'Statt des Namens in der Konfiguration des Adapters',
                    ru: 'Вместо имени в конфигурации адаптера',
                    pt: 'Em vez do nome na configuração do adaptador',
                    nl: 'In plaats van de naam in de configuratie van de adapter',
                    fr: "À la place du nom dans la configuration de l'adaptateur",
                    it: "Al posto del nome nella configurazione dell'adattatore",
                    es: 'En lugar del nombre en la configuración del adaptador',
                    pl: 'Zamiast nazwy w konfiguracji adaptera',
                    uk: 'Замість імені в конфігурації адаптера',
                    'zh-cn': '代替适配器配置中的名称',
                },
            },
            hideIp: {
                type: 'checkbox',
                default: false,
                hidden: '!data.showName',
                label: {
                    en: 'Hide IP address',
                    de: 'IP-Adresse ausblenden',
                    ru: 'Скрыть IP-адрес',
                    pt: 'Ocultar endereço IP',
                    nl: 'IP-adres verbergen',
                    fr: "Masquer l'adresse IP",
                    it: 'Nascondi indirizzo IP',
                    es: 'Ocultar dirección IP',
                    pl: 'Ukryj adres IP',
                    uk: 'Сховати IP-адресу',
                    'zh-cn': '隐藏 IP 地址',
                },
            },
            showResponseTime: {
                type: 'checkbox',
                default: true,
                label: {
                    en: 'Show response time',
                    de: 'Antwortzeit anzeigen',
                    ru: 'Показывать время отклика',
                    pt: 'Mostrar tempo de resposta',
                    nl: 'Reactietijd weergeven',
                    fr: 'Afficher le temps de réponse',
                    it: 'Mostra tempo di risposta',
                    es: 'Mostrar tiempo de respuesta',
                    pl: 'Pokaż czas odpowiedzi',
                    uk: 'Показувати час відгуку',
                    'zh-cn': '显示响应时间',
                },
                help: {
                    en: 'Only for devices with "Extended Info"',
                    de: 'Nur bei Geräten mit "Erweiterte Informationen"',
                    ru: 'Только для устройств с "Расширенная информация"',
                    pt: 'Apenas para dispositivos com "Extended Info"',
                    nl: 'Alleen voor apparaten met "Extended Info"',
                    fr: 'Uniquement pour les appareils avec « Extended Info »',
                    it: 'Solo per dispositivi con "Extended Info"',
                    es: 'Solo para dispositivos con "Extended Info"',
                    pl: 'Tylko dla urządzeń z "Extended Info"',
                    uk: 'Лише для пристроїв із "Розширена інформація"',
                    'zh-cn': '仅适用于启用"扩展信息"的设备',
                },
            },
        },
    },
};

const overviewManifest: WebComponentManifest = {
    $schema: SCHEMA,
    manifestVersion: 1,
    tag: OVERVIEW_TAG,
    // the label of the devices widget `PingStatusOverviewComponent`, which has no translations
    name: 'Ping Overview',
    description: {
        en: 'Shows how many devices answer; all devices in a dialog',
        de: 'Zeigt, wie viele Geräte antworten; alle Geräte in einem Dialog',
        ru: 'Показывает, сколько устройств отвечает; все устройства в диалоге',
        pt: 'Mostra quantos dispositivos respondem; todos os dispositivos numa caixa de diálogo',
        nl: 'Toont hoeveel apparaten antwoorden; alle apparaten in een dialoog',
        fr: "Indique combien d'appareils répondent ; tous les appareils dans une boîte de dialogue",
        it: 'Mostra quanti dispositivi rispondono; tutti i dispositivi in una finestra di dialogo',
        es: 'Muestra cuántos dispositivos responden; todos los dispositivos en un diálogo',
        pl: 'Pokazuje, ile urządzeń odpowiada; wszystkie urządzenia w oknie dialogowym',
        uk: 'Показує, скільки пристроїв відповідає; усі пристрої в діалозі',
        'zh-cn': '显示有多少设备响应；在对话框中显示所有设备',
    },
    // relative to this file: the preview of the devices widget, /adapter/ping/dm-widgets/overview.png
    icon: '../dm-widgets/overview.png',
    module: getModuleFile('ping-overview'),
    // a tile of devices: one cell of 160 px
    size: { width: 160, height: 160 },
    settings: {
        type: 'panel',
        items: {
            instance: {
                type: 'instance',
                adapter: 'ping',
                default: 'ping.0',
                label: {
                    en: 'Ping adapter instance',
                    de: 'Ping-Adapter-Instanz',
                    ru: 'Экземпляр адаптера Ping',
                    pt: 'Instância do adaptador Ping',
                    nl: 'Ping-adapterinstantie',
                    fr: "Instance de l'adaptateur Ping",
                    it: 'Istanza adattatore Ping',
                    es: 'Instancia del adaptador Ping',
                    pl: 'Instancja adaptera Ping',
                    uk: 'Екземпляр адаптера Ping',
                    'zh-cn': 'Ping 适配器实例',
                },
            },
            hideDisabled: {
                type: 'checkbox',
                default: false,
                label: {
                    en: 'Hide disabled devices',
                    de: 'Deaktivierte Geräte ausblenden',
                    ru: 'Скрыть отключенные устройства',
                    pt: 'Ocultar dispositivos desativados',
                    nl: 'Uitgeschakelde apparaten verbergen',
                    fr: 'Masquer les appareils désactivés',
                    it: 'Nascondi dispositivi disattivati',
                    es: 'Ocultar dispositivos deshabilitados',
                    pl: 'Ukryj wyłączone urządzenia',
                    uk: 'Сховати вимкнені пристрої',
                    'zh-cn': '隐藏已禁用的设备',
                },
            },
        },
    },
};

/** The manifest of each component */
export const MANIFESTS: Record<ComponentName, WebComponentManifest> = {
    'ping-device': deviceManifest,
    'ping-overview': overviewManifest,
};
