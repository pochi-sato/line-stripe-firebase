import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import * as line from '@line/bot-sdk';

const firebaseApp = admin.initializeApp();
const firestore = firebaseApp.firestore();
// const auth = firebaseApp.auth();

const LINE_ACCESS_TOKEN = 'YOUR-ACCESS-TOKEN';

const LINE_USER_ID = 'YOUR-LINE-USER-ID';

const client = new line.Client({
  channelAccessToken: LINE_ACCESS_TOKEN,
});

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
      functions.logger.info(event.message.text);
      functions.logger.info('id: ' + event.source.userId);
    }

    await firestore.collection('invoices').add({
      email: 'customer@example.com',
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

    response.send('Hello line きて!');
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

    if (invoiceUrl) {
      await client.pushMessage(LINE_USER_ID, {
        type: 'text',
        text: `おかねちょうだい！ここから決済してね！\n${invoiceUrl}`,
      });
    }

    response.send('Hello stripe!');
  });
