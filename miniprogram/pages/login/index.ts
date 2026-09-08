import { errorText,wxSignIn,continueAfterLogin } from '../../services/identity';
Page({data:{loading:false,error:''},async login(){this.setData({loading:true,error:''});try{await wxSignIn();continueAfterLogin();}catch(e){this.setData({error:errorText(e)});}finally{this.setData({loading:false});}}});
