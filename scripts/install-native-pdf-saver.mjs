/**
 * Registers the native Android Save-As PDF plugin in the generated Capacitor
 * MainActivity. Run after cap add android and cap sync android.
 * Supports both standalone Annual Return APK and embedded DMS APK.
 */
import {readFileSync,writeFileSync,mkdirSync,existsSync,copyFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';

const target=process.argv[2]||'annual-return';
if(!['annual-return','.'].includes(target))throw Error('Only annual-return or . are supported targets');
const root=resolve(process.cwd(),target);
const config=JSON.parse(readFileSync(join(root,'capacitor.config.json'),'utf8'));
if(!/^(com\.zhenli\.[a-z][a-z0-9.]*)$/.test(config.appId||''))throw Error('Unexpected application ID.');
const javaRoot=join(root,'android/app/src/main/java');
const mainActivity=join(javaRoot,...config.appId.split('.'),'MainActivity.java');
if(!existsSync(mainActivity))throw Error('Android MainActivity missing: run cap add first.');
const nativePlugin=resolve(process.cwd(),'native/AnnualReturnSaver.java');
if(!existsSync(nativePlugin))throw Error('AnnualReturnSaver source missing.');
const pluginDestination=join(javaRoot,'com/zhenli/export/AnnualReturnSaver.java');
mkdirSync(dirname(pluginDestination),{recursive:true});
copyFileSync(nativePlugin,pluginDestination);
const main=[
 'package '+config.appId+';',
 '',
 'import android.os.Bundle;',
 'import com.getcapacitor.BridgeActivity;',
 'import com.zhenli.export.AnnualReturnSaver;',
 '',
 'public class MainActivity extends BridgeActivity {',
 '  @Override',
 '  public void onCreate(Bundle savedInstanceState) {',
 '    registerPlugin(AnnualReturnSaver.class);',
 '    super.onCreate(savedInstanceState);',
 '  }',
 '}',
 ''
].join('\n');
writeFileSync(mainActivity,main,'utf8');
if(!readFileSync(mainActivity,'utf8').includes('registerPlugin(AnnualReturnSaver.class)'))throw Error('Registration failed.');
console.log('Installed Android Save As plugin in '+target+' ('+config.appId+').');
