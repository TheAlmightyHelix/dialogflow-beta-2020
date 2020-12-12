const express = require('express')
const { WebhookClient } = require('dialogflow-fulfillment')
const app = express()
const fetch = require('node-fetch')
const base64 = require('base-64')

let username = "";
let password = "";
let token = "";

USE_LOCAL_ENDPOINT = true;
// set this flag to true if you want to use a local endpoint
// set this flag to false if you want to use the online endpoint
ENDPOINT_URL = ""
if (USE_LOCAL_ENDPOINT) {
  ENDPOINT_URL = "http://127.0.0.1:5000"
} else {
  ENDPOINT_URL = "https://mysqlcs639.cs.wisc.edu"
}



async function getToken() {
  let request = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + base64.encode(username + ':' + password)
    },
    redirect: 'follow'
  }

  const serverReturn = await fetch(ENDPOINT_URL + '/login', request)
  const serverResponse = await serverReturn.json()
  token = serverResponse.token

  return token;
}



async function redirect(page) {

  // console.log(token)

  let request = {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token
    },
    body: JSON.stringify({
      "back": false,
      "dialogflowUpdated": true,
      "page": page
    })
  }

  await fetch(
    ENDPOINT_URL + '/application', request
  ).then(
    //   res => res.json()
    // ).then(
    //   data => console.log(data)
    // ).catch(
    //   err => console.log("ERROR: " + err)
  )
}



async function message(agent, isUser, m, date = new Date()) {
  isUser ? '' : agent.add(m)

  let request = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token
    },
    body: JSON.stringify({
      "date": date.toISOString(),
      "isUser": isUser,
      "text": m
    })
  }

  await fetch(ENDPOINT_URL + '/application/messages', request)
}



async function productList() {
  return (await fetch(
    ENDPOINT_URL + '/products'
  ).then(
    res => res.json()
  ).catch(
    err => console.log(err)
  )).products
}

async function cartList() {
  let request = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token
    },
    redirect: 'follow'
  }

  return await fetch(
    ENDPOINT_URL + '/application/products', request
  ).then(
    res => res.json()
  )
}



async function tagList(category) {
  // console.log('fetching tags...')
  return (await fetch(
    ENDPOINT_URL + '/categories/' + category + '/tags'
  ).then(
    res => res.json()
  )).tags
}



async function whereAmI() {
  let request = {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'x-access-token': token
    },
    redirect: 'follow'
  }

  return (await fetch(
    ENDPOINT_URL + '/application', request
  ).then(
    res => res.json()
  )).page
}















app.get('/', (req, res) => res.send('online'))
app.post('/', express.json(), (req, res) => {
  const agent = new WebhookClient({ request: req, response: res })



  async function welcome() {
    await message(agent, true, agent.query)
    await message(agent, false, 'Welcome to WiscShop!')
  }



  async function login() {
    // You need to set this from `username` entity that you declare in DialogFlow
    username = agent.parameters.username
    // You need to set this from password entity that you declare in DialogFlow
    password = agent.parameters.password

    await getToken().then(t => {
      if (t) {
        message(agent, false, 'You are now logged in!')
        agent.context.set({
          'name': 'verified_user',
          'lifespan': 50,
          'parameters': {
            'username': username,
            'password': password
          }
        }
        )
        redirect(`/${username}`)
      }
      else
        message(agent, false, 'invalid credentials. Please try again.')
    }
    )
  }



  async function qCategories() {

    await message(agent, true, agent.query)

    await fetch(
      ENDPOINT_URL + '/categories'
    ).then(
      res => res.json()
    ).then(
      data => {
        console.log('We have ' + data.categories.toString())
        message(agent, false, 'We have ' + data.categories.join(', ') + '.')
      }
    )
  }



  async function qTags() {

    await message(agent, true, agent.query)

    await fetch(
      ENDPOINT_URL + '/categories/' + agent.parameters.category + '/tags'
    ).then(
      res => res.json()
    ).then(
      data => {
        console.log(data)
        message(agent, false, `We have ${data.tags.join(', ')} tags for ${agent.parameters.category}`)
      }
    )
  }



  async function qCartItems() {
    let request = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token
      },
      redirect: 'follow'
    }

    await message(agent, true, agent.query)

    await fetch(
      ENDPOINT_URL + '/application/products', request
    ).then(
      res => res.json()
    ).then(
      data => {
        console.log(data.products)
        let names = []
        for (const iterator of data.products) {
          names.push(iterator.name)
        }
        message(agent, false, 'You have ' + names.join(', ') + ' in your cart.')
      }
    )
  }



  async function qCartTotal() {
    let request = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token
      },
      redirect: 'follow'
    }

    await message(agent, true, agent.query)

    await fetch(
      ENDPOINT_URL + '/application/products', request
    ).then(
      res => res.json()
    ).then(
      data => {
        console.log(data.products)
        let total = 0.0
        for (const iterator of data.products) {
          total += iterator.price * iterator.count
        }
        message(agent, false, `Your total is $${total}.`)
      }
    )

  }



  async function qProduct() {
    let list = await productList()
    console.log(list)
    message(agent, true, agent.query)

    for (const item of list) {
      if (item.name.toLowerCase() === agent.parameters.product.toLowerCase()) {
        console.log(item.description)
        await message(agent, false, 'Sure! The description says: ' + item.description)
        if (item.description) {
          await message(agent, false, 'Do you want to hear the reviews?')

          agent.context.set({
            'name': 'QProduct-followup',
            'lifespan': 2,
            'parameters': {
              'itemID': item.id
            }
          })
        }
        return
      }
    }
  }


  async function qReview() {
    const item = agent.context.get('qproduct-followup')
    // console.log(item)

    await message(agent, true, agent.query)

    await fetch(
      ENDPOINT_URL + '/products/' + item.parameters.itemID + '/reviews'
    ).then(
      res => res.json()
    ).then(
      data => {

        for (const review of data.reviews) {
          message(agent, false, 'Review titled \"' + review.title + '\" says, ' + review.text)

        }
      }
    )
  }

  async function qStars() {
    const item = agent.context.get('qproduct-followup')

    await message(agent, true, agent.query)

    await fetch(
      ENDPOINT_URL + '/products/' + item.parameters.itemID + '/reviews'
    ).then(
      res => res.json()
    ).then(
      data => {
        let sum = 0.0
        for (const review of data.reviews) {
          sum += review.stars
        }

        message(agent, false, `This item has an average rating of ${sum / data.reviews.length} stars.`)
      }
    )
  }



  async function aTags() {
    await message(agent, true, agent.query)

    let tags = []
    const endpoint = (await whereAmI()).split('/')
    const legalTags = await tagList(endpoint[endpoint.length - 1])

    for (const item of agent.parameters.tag) {
      if (legalTags.includes(item)) tags.push(item)
    }

    let request = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token
      }
    }

    for (const tag of tags) {
      await fetch(
        ENDPOINT_URL + '/application/tags/' + tag, request
      )

      console.log(await fetch(
        ENDPOINT_URL + '/application/tags', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-access-token': token
        }
      }
      ).then(res => res.json()))
    }

  }



  async function aCart() {
    let list = await productList()
    let quantity = agent.parameters.quantity ? agent.parameters.quantity : 1
    let request = {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token
      }
    }

    await message(agent, true, agent.query)
    let total = 0.0

    for (const item of list) {
      if (item.name.toLowerCase() === agent.parameters.product.toLowerCase()) {
        total += item.price
        for (let i = 0; i < quantity; i++) {
          await fetch(
            ENDPOINT_URL + '/application/products/' + item.id, request
          )
        }
        await message(agent, false, 'added!')
        return total
      }
    }
  }



  async function rCart() {
    let list = await cartList()
    // console.log(list.products)
    let quantity = agent.parameters.quantity ? agent.parameters.quantity : 1
    let request = {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token
      }
    }

    await message(agent, true, agent.query)

    for (const item of list.products) {
      console.log('ITEMS: ', item)
      console.log('PARAM: ', agent.parameters.item, agent.parameters.quantity)
      if (item.name.toLowerCase() === agent.parameters.item.toLowerCase()) {
        for (let i = 0; i < quantity; i++) {
          await fetch(ENDPOINT_URL + '/application/products/' + item.id, request)
        }
        await message(agent, false, 'Done!')
        return
      }
    }
  }


  async function confirm() {
    await message(agent, true, agent.query)

    await redirect(`/${username}/cart-confirmed`)

  }

  async function review() {

    await redirect(`/${username}/cart-review`)
    await qCartItems()
    await qCartTotal()

  }



  async function navigate() {
    await message(agent, true, agent.query, new Date())
    const page = agent.parameters.page
    const category = agent.parameters.category
    const product = agent.parameters.product




    if (!page && !category && !product) {
      await message(
        agent,
        false,
        'Please try again and specify the page you want to go to or the type of product you want to browse.'
      )
      return
    }
    if (!category && !product) {
      await message(agent, false, 'Redirecting to ' + page)
      if (page === 'Home') {
        await redirect(`/${username}`)
      }
      else if (page === 'Sign-In')
        await redirect(`/singIn`)
      else if (page === 'Sign-Up')
        await redirect(`/signUp`)
      else if (page === 'Category')
        await redirect(`/${username}`)
      else if (page === 'Cart')
        await redirect(`/${username}/cart`)
    } else if (!category && !page) {
      // http://localhost:3000/yuheng/sweatshirts/products/13
      let list = await productList()
      for (const item of list) {
        if (product.toLowerCase() === item.name.toLowerCase()) {
          await message(agent, false, 'Showing ' + product)
          await redirect(`/${username}/${item.category}/products/${item.id}`)
          break
        }
      }
    }
    else {
      await message(agent, false, 'Showing all the ' + category)
      agent.context.set({
        'name': 'category_page',
        'lifespan': 5,
        'parameters': {
          'category': category
        }
      })
      await redirect(`/${username}/${category}`)
    }

    // console.log(agent.query)
  }



  async function logout() {
    await message(agent, true, agent.query)
    await message(agent, false, 'logging you out...')

    agent.context.set({
      'name': 'verified_user',
      'lifespan': 0
    }
    )
    await redirect('')

    // erase messages
    let request = {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token
      }
    }
    await fetch(ENDPOINT_URL + '/application/messages', request)

    token = ''
    console.log('log out finished')
  }



  function utility() {
    // await message(agent, true, agent.query, new Date())

    console.log(token)

    // erase messages
    let request1 = {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token
      }
    }
    fetch(ENDPOINT_URL + '/application/messages', request1)

    let request2 = {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-access-token': token
      },
      redirect: 'follow'
    }

    fetch(
      ENDPOINT_URL + '/application', request2
    ).then(
      res => res.json()
    ).then(
      data => console.log(data)
    )

    agent.add('done')
    // await message(agent, false, 'token: ' + (token ? 'valid' : 'none'), new Date())
  }



  let intentMap = new Map()
  intentMap.set('Default Welcome Intent', welcome)
  // You will need to declare this `Login` content in DialogFlow to make this work
  intentMap.set('Login', login)
  intentMap.set('QCategories', qCategories)
  intentMap.set('QTags', qTags)
  intentMap.set('QCartItems', qCartItems)
  intentMap.set('QCartTotal', qCartTotal)
  intentMap.set('QProduct', qProduct)
  intentMap.set('QProduct - yes', qReview)
  intentMap.set('QStars', qStars)
  intentMap.set('ATags', aTags)
  intentMap.set('ACart', aCart)
  intentMap.set('RCart', rCart)
  intentMap.set('APurchase', review)
  intentMap.set('AConfirm', confirm)
  intentMap.set('Navigate', navigate)
  intentMap.set('Logout', logout)
  intentMap.set('Utility', utility)
  agent.handleRequest(intentMap)
})

app.listen(process.env.PORT || 8080)
