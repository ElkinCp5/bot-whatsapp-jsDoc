import { CoreClass } from '@bot-whatsapp/bot'
import { SessionsClient } from '@google-cloud/dialogflow-cx'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

import { DialogFlowContextOptions, DialogFlowCredentials, MessageContextIncoming } from '../types'

const GOOGLE_ACCOUNT_PATH = join(process.cwd(), 'google-key.json')

export class DialogFlowContext {
    private coreInstance: CoreClass
    projectId: string | null = null
    configuration = null
    sessionClient = null
    optionsDX: DialogFlowContextOptions = {
        language: 'es',
        location: '',
        agentId: '',
    }

    constructor(_database, _provider, _optionsDX = {}) {
        this.coreInstance = new CoreClass(null, _database, _provider, null)
        this.optionsDX = { ...this.optionsDX, ..._optionsDX }
    }

    loadCredentials = (): DialogFlowCredentials | null => {
        if (!existsSync(GOOGLE_ACCOUNT_PATH)) {
            console.log(`[ERROR]: No se encontró ${GOOGLE_ACCOUNT_PATH}`)
            return null
        }

        const rawJson = readFileSync(GOOGLE_ACCOUNT_PATH, 'utf-8')
        return JSON.parse(rawJson) as DialogFlowCredentials
    }

    private initializeDialogFlowClient = (credentials: DialogFlowCredentials): void => {
        const { project_id, private_key, client_email } = credentials

        this.projectId = project_id
        this.configuration = {
            credentials: {
                private_key,
                client_email,
            },
        }

        this.sessionClient = new SessionsClient(this.configuration)
    }

    /**
     * Verificar conexión con servicio de DialogFlow
     */
    init = () => {
        const credentials = this.loadCredentials()

        if (credentials) {
            this.initializeDialogFlowClient(credentials)
        }
    }

    /**
     * GLOSSARY.md
     * @param {*} messageCtxInComming
     * @returns
     */
    handleMsg = async (messageCtxInComming: MessageContextIncoming): Promise<any> => {
        const languageCode = this.optionsDX.language
        const { from, body } = messageCtxInComming

        /**
         * 📄 Creamos session de contexto basado en el numero de la persona
         * para evitar este problema.
         * https://github.com/codigoencasa/bot-whatsapp/pull/140
         */
        const session = this.sessionClient.projectAgentSessionPath(this.projectId, from)

        const reqDialog = {
            session,
            queryInput: {
                text: {
                    text: body,
                    languageCode,
                },
            },
        }

        const [single] = (await this.sessionClient.detectIntent(reqDialog)) || [null]

        const listMessages = single?.queryResult?.responseMessages?.map((res) => {
            if (res.message === 'text') {
                return { answer: res.text.text[0] }
            }

            if (res.message === 'payload') {
                const { media = null, buttons = [], answer = '' } = res.payload.fields
                const buttonsArray =
                    buttons?.listValue?.values?.map((btnValue): { body: string } => {
                        const { stringValue } = btnValue.structValue.fields.body
                        return { body: stringValue }
                    }) || []
                return {
                    answer: answer?.stringValue || '',
                    options: {
                        media: media?.stringValue,
                        buttons: buttonsArray,
                    },
                }
            }
            return { answer: '' }
        })

        this.coreInstance.sendFlowSimple(listMessages, from)
    }
}
