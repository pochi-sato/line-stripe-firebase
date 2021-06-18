import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as line from '@line/bot-sdk';

const LINE_ACCESS_TOKEN = 'YOUR-ACCESS-TOKEN';

const firebaseApp = admin.initializeApp();
const firestore = firebaseApp.firestore();
const auth = firebaseApp.auth();

const client = new line.Client({
  channelAccessToken: LINE_ACCESS_TOKEN,
});

enum ClaimKeys {
  LineId = 'lineId',
}

const getFirebaseUid = (lineUserId: string) => 'line:' + lineUserId;

// StripeのInvoiceのパラメータ。商品情報などを入れて動的にするとEC感が増します
const createInvoiceParams = (uid: string) => ({
  uid, // Firebase Authenticationsのuidを入れれば、Firebaseから勝手にそのユーザーのemailを引っ張ってStripeに入れてくれるはずです
  items: [
    {
      amount: 1999,
      currency: 'usd',
      quantity: 2, // Optional, defaults to 1.
      description: 'my super cool item',
    },
    {
      amount: 540,
      currency: 'usd',
      description: 'shipping cost',
    },
  ],
});

const createUser = async (
  uid: string,
  email: string,
  displayName: string,
  lineUserId: string
) => {
  const user = await auth.createUser({
    uid,
    email,
    emailVerified: false,
    password: 'secretPassword',
    displayName,
    photoURL: 'http://www.example.com/12345678/photo.png',
    disabled: false,
  });

  /**
   * LINE送信用に、LINEのユーザーIDをclaimに格納しておく。
   * ただ、uidもLINEのIDから作ってるので、claimに保存しなくても、uid.split(':')[1]ってしても取れます。主義の問題。
   */
  await auth.setCustomUserClaims(uid, {
    [ClaimKeys.LineId]: lineUserId,
  });
  return user;
};

export const lineWebhook = functions
  .region('asia-northeast1')
  .https.onRequest(async (request, response) => {
    functions.logger.info('debug1 Hello line logs!', { structuredData: true });

    const data = request.body as line.WebhookRequestBody;
    const event = data.events[0];
    if (!event) {
      response.sendStatus(200);
      return;
    }

    if (event.type === 'message' && event.message.type === 'text') {
      const lineUserId = event.source.userId;

      if (!lineUserId) throw new Error('no line user id');

      const uid = getFirebaseUid(lineUserId);
      const displayName = lineUserId + 'さん'; // 雑にやってます
      const mail = lineUserId + '@example.com'; // 雑にやってます

      // FirebaseからUserを取得する
      await auth.getUser(uid).catch(async (e) => {
        if (e.code === 'auth/user-not-found') {
          // ユーザーがまだ作られていないエラーなので、新規ユーザー追加する
          await createUser(uid, mail, displayName, lineUserId);
        }
      });

      const invoice = createInvoiceParams(uid);

      await firestore.collection('invoices').add(invoice);
      response.send('Success!');
      return;
    }

    response.sendStatus(200);
  });

export const stripeWebhook = functions
  .region('asia-northeast1')
  .https.onRequest(async (request, response) => {
    functions.logger.info('Hello stripe logs!', { structuredData: true });

    const webhookResponse = request.body;

    if (webhookResponse.type !== 'invoice.finalized') {
      response.sendStatus(200);
      return;
    }

    const invoiceUrl = webhookResponse?.data?.object?.['hosted_invoice_url'];
    const customerEmail = webhookResponse?.data?.object?.['customer_email'];

    if (invoiceUrl && customerEmail) {
      const user = await auth.getUserByEmail(customerEmail);
      const lineUserId = user.customClaims?.[ClaimKeys.LineId];
      await client.pushMessage(lineUserId, {
        type: 'text',
        text: `おかねちょうだい！ここから決済してね！\n${invoiceUrl}`,
      });
      response.send('Success!');
      return;
    }

    response.sendStatus(200);
  });
