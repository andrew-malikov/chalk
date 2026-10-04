import { BrowserWindow } from "electrobun/main";

const window = new BrowserWindow({title:"Review",url:"views://mainview/index.html",frame:{width:1200,height:850}});
window.webview.setNavigationRules(["^*", "views://mainview/*"]);
